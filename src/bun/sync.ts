import type { SyncMode } from "../shared/types";
import {
  insertMessages,
  updateSyncState,
  getSyncState,
  clearMessages,
  getMessageCount,
  listMessageIds,
  upsertMessageMetadata,
  upsertImapFolderSync,
  getImapFolderSync,
  upsertSubscription,
  type InsertMessageInput,
} from "./db";
import { getProvider } from "./provider";
import { getAccount } from "./accounts";
import {
  listMessages,
  getMessage,
  getMessageMetadata,
  getHistory,
  extractBodies as gmailExtractBodies,
  parseHeaders,
  classifyMessageNature,
  isReadFromLabels,
  GmailAPIError,
  HistoryGapError,
  type GmailMessage,
} from "./gmail";
import type { FetchedMessage, EmailProvider } from "./provider";

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 5;
  const baseDelay = options.baseDelay ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GmailAPIError) {
        if (err.isRateLimit() && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
          console.log(`Rate limited. Retrying in ${Math.round(delay)}ms...`);
          await Bun.sleep(delay);
          continue;
        }
        if (err.isAuthError() && attempt < maxRetries) {
          await Bun.sleep(500);
          continue;
        }
      }
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}

export interface SyncProgress {
  current: number;
  total: number;
}

export type ProgressCallback = (progress: SyncProgress) => void;

type SyncPhase = "initial" | "background";

const INITIAL_SYNC_TARGET = 3000;
const PAGE_SIZE = 500;
const FETCH_CONCURRENCY = 15;
const INSERT_BATCH_SIZE = 50;
const MESSAGE_METADATA_BATCH_SIZE = 250;
const CURRENT_METADATA_SCHEMA_VERSION = 4;
const DEFERRED_FULL_SYNC_BATCH_TARGET = 500;
const DEFERRED_FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const FAST_POLL_INTERVAL_MS = 4000;
const IDLE_POLL_INTERVAL_MS = 10000;
const ERROR_POLL_INTERVAL_MS = 15000;
const EMPTY_POLLS_BEFORE_IDLE = 12;
const ALL_MAIL_QUERY = "-in:spam -in:chats";

let syncLock = false;
let syncGeneration = 0;

function getCurrentSyncGeneration(): number {
  return syncGeneration;
}

export function cancelSync(): void {
  syncGeneration += 1;
}

export function isSyncLocked(): boolean {
  return syncLock;
}

class SyncCancelledError extends Error {
  constructor() {
    super("Sync cancelled");
    this.name = "SyncCancelledError";
  }
}

function checkSyncCancelled(expectedGen: number): void {
  if (syncGeneration !== expectedGen) {
    throw new SyncCancelledError();
  }
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T | "locked"> {
  if (syncLock) return "locked";
  syncLock = true;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SyncCancelledError) {
      console.log("🛑 Sync was cancelled — aborting gracefully");
      await updateSyncState({ status: "idle", phase: null, progressCurrent: null, progressTotal: null, error: null });
    }
    throw err;
  } finally {
    syncLock = false;
  }
}

function getMailboxFlags(labelIds: string[] | undefined) {
  const labels = new Set((labelIds ?? []).map((label) => label.toUpperCase()));
  return {
    isInbox: labels.has("INBOX"),
    isSent: labels.has("SENT"),
    isDraft: labels.has("DRAFT"),
    isTrash: labels.has("TRASH"),
  };
}

function toStoredMessageMetadata(msg: GmailMessage) {
  const headers = parseHeaders(msg.payload.headers ?? []);

  return {
    id: msg.id,
    threadId: msg.threadId,
    historyId: msg.historyId,
    internalDate: parseInt(msg.internalDate, 10),
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    snippet: msg.snippet,
    category: classifyMessageNature({
      labelIds: msg.labelIds,
      from: headers["from"],
      subject: headers["subject"],
      snippet: msg.snippet,
    }),
    isRead: isReadFromLabels(msg.labelIds),
    ...getMailboxFlags(msg.labelIds),
    listUnsubscribe: headers["list-unsubscribe"] ?? null,
    listId: headers["list-id"] ?? null,
  };
}

function fetchedMessageToInsert(msg: FetchedMessage): InsertMessageInput {
  return {
    id: msg.id,
    threadId: msg.threadId,
    historyId: msg.internalDate,
    internalDate: parseInt(msg.internalDate, 10),
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    snippet: msg.snippet,
    bodyText: msg.bodyText,
    bodyHtml: msg.bodyHtml,
    attachments: msg.attachments,
    category: msg.category,
    isRead: msg.isRead,
    isInbox: msg.isInbox,
    isSent: msg.isSent,
    isDraft: msg.isDraft,
    isTrash: msg.isTrash,
    listUnsubscribe: msg.listUnsubscribe ?? null,
    listId: msg.listId ?? null,
  };
}

function processSubscriptions(messages: Array<{ from: string; category: string; listUnsubscribe?: string | null; listId?: string | null; internalDate: number }>): void {
  const seen = new Set<string>();
  for (const msg of messages) {
    if (!msg.listUnsubscribe) continue;

    const senderEmail = msg.from
      .split(",")[0]
      .replace(/^"?[^"<]*"?\s*<([^>]+)>$/, "$1")
      .trim()
      .toLowerCase();
    if (!senderEmail || !senderEmail.includes("@")) continue;

    const key = `${senderEmail}:${msg.listUnsubscribe}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const senderName = msg.from
      .split(",")[0]
      .replace(/^"?([^"<]*)"?\s*<[^>]+>$/, "$1")
      .trim();

    void upsertSubscription({
      senderEmail,
      senderName,
      listUnsubscribe: msg.listUnsubscribe,
      listId: msg.listId,
      category: msg.category,
      internalDate: msg.internalDate,
    });
  }
}

// ── Gmail-specific sync ──

async function fetchMessagesPool(
  ids: string[],
  accessToken: string,
  concurrency: number,
  fetcher: (accessToken: string, messageId: string) => Promise<GmailMessage> = getMessage,
  expectedGen?: number
): Promise<GmailMessage[]> {
  const results: GmailMessage[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < ids.length) {
      if (expectedGen !== undefined) checkSyncCancelled(expectedGen);
      const id = ids[index++];
      try {
        const msg = await withRetry(() => fetcher(accessToken, id));
        results.push(msg);
      } catch (err) {
        console.error(`Failed to fetch message ${id}:`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function runSyncPass({
  phase,
  limit,
  startPageToken,
  totalEstimate,
  processedBeforeStart = 0,
  latestHistoryId,
  onProgress,
}: {
  phase: SyncPhase;
  limit?: number;
  startPageToken?: string;
  totalEstimate?: number;
  processedBeforeStart?: number;
  latestHistoryId?: string;
  onProgress?: ProgressCallback;
}) {
  const gen = getCurrentSyncGeneration();
  const { getValidAccessToken } = await import("./auth");
  const accessToken = await getValidAccessToken();
  const firstPage =
    totalEstimate === undefined
      ? await withRetry(() =>
          listMessages(accessToken, { maxResults: 1, q: ALL_MAIL_QUERY })
        )
      : null;
  let resolvedTotalEstimate =
    totalEstimate ?? firstPage?.resultSizeEstimate ?? INITIAL_SYNC_TARGET;
  let progressTotal =
    phase === "initial"
      ? Math.min(limit ?? INITIAL_SYNC_TARGET, resolvedTotalEstimate)
      : resolvedTotalEstimate;
  const targetProcessed =
    limit === undefined ? undefined : processedBeforeStart + limit;

  let pageToken = startPageToken;
  let processed = processedBeforeStart;

  await updateSyncState({
    status: "syncing",
    phase,
    progressCurrent: processed,
    progressTotal: Math.max(progressTotal, processed + (startPageToken ? 1 : 0)),
    historyId: latestHistoryId ?? undefined,
    error: null,
  });

  do {
    checkSyncCancelled(gen);
    const page = await withRetry(() =>
      listMessages(accessToken, {
        maxResults: PAGE_SIZE,
        pageToken,
        q: ALL_MAIL_QUERY,
      })
    );

    if (page.resultSizeEstimate && page.resultSizeEstimate > resolvedTotalEstimate) {
      resolvedTotalEstimate = page.resultSizeEstimate;
      progressTotal =
        phase === "initial"
          ? Math.min(limit ?? INITIAL_SYNC_TARGET, resolvedTotalEstimate)
          : resolvedTotalEstimate;
    }

    const pageMessages = page.messages ?? [];
    if (pageMessages.length === 0) {
      pageToken = undefined;
      break;
    }

    const remaining =
      targetProcessed === undefined
        ? pageMessages.length
        : Math.max(targetProcessed - processed, 0);
    const messagesToFetch =
      targetProcessed === undefined
        ? pageMessages
        : pageMessages.slice(0, remaining);

    const ids = messagesToFetch.map((m) => m.id);
    const fetched = await fetchMessagesPool(ids, accessToken, FETCH_CONCURRENCY, getMessage, gen);

    if (!latestHistoryId && fetched.length > 0) {
      latestHistoryId = fetched[0].historyId;
    }

    for (let i = 0; i < fetched.length; i += INSERT_BATCH_SIZE) {
      checkSyncCancelled(gen);
      const chunk = fetched.slice(i, i + INSERT_BATCH_SIZE);
      await flushInsertBuffer(chunk, accessToken);
      processed += chunk.length;

      const hasMore = page.nextPageToken !== undefined ||
        (targetProcessed !== undefined && processed < targetProcessed);
      const progress = {
        current: processed,
        total: Math.max(progressTotal, processed + (hasMore ? 1 : 0)),
      };
      await updateSyncState({
        status: "syncing",
        phase,
        progressCurrent: progress.current,
        progressTotal: progress.total,
        historyId: latestHistoryId,
        error: null,
      });
      onProgress?.(progress);
    }

    pageToken = page.nextPageToken;
    if (targetProcessed !== undefined && processed >= targetProcessed) {
      break;
    }
  } while (pageToken);

  return {
    processed,
    totalEstimate: resolvedTotalEstimate,
    nextPageToken: pageToken,
    latestHistoryId,
  };
}

async function flushInsertBuffer(
  messages: GmailMessage[],
  accessToken: string
): Promise<void> {
  const toInsert = await Promise.all(
    messages.map(async (msg) => {
      const bodies = await gmailExtractBodies(msg.payload, accessToken, msg.id);
      const headers = parseHeaders(msg.payload.headers ?? []);

      return {
        id: msg.id,
        threadId: msg.threadId,
        historyId: msg.historyId,
        internalDate: parseInt(msg.internalDate, 10),
        from: headers["from"] ?? "",
        to: headers["to"] ?? "",
        subject: headers["subject"] ?? "",
        snippet: msg.snippet,
        bodyText: bodies.text,
        bodyHtml: bodies.html,
        attachments: bodies.attachments,
        category: classifyMessageNature({
          labelIds: msg.labelIds,
          from: headers["from"],
          subject: headers["subject"],
          snippet: msg.snippet,
          bodyText: bodies.text,
        }),
        isRead: isReadFromLabels(msg.labelIds),
        ...getMailboxFlags(msg.labelIds),
        listUnsubscribe: headers["list-unsubscribe"] ?? null,
        listId: headers["list-id"] ?? null,
      };
    })
  );

  await insertMessages(toInsert);
  processSubscriptions(toInsert);
}

// ── Provider-based sync dispatcher ──

async function getProviderForAccount(email: string | null): Promise<EmailProvider | null> {
  if (!email) return null;

  const cached = getProvider(email);
  if (cached) return cached;

  const account = await getAccount(email);
  if (!account) return null;

  if (account.provider === "gmail") {
    const { GmailProvider } = await import("./gmail-provider");
    const provider = new GmailProvider(email);
    const { registerProvider } = await import("./provider");
    registerProvider(email, provider);
    return provider;
  }

  if (account.provider === "imap") {
    const { ImapProvider } = await import("./imap-provider");
    const provider = new ImapProvider(email);
    const { registerProvider } = await import("./provider");
    registerProvider(email, provider);
    return provider;
  }

  return null;
}

export async function doFullSync(
  onProgress?: ProgressCallback
): Promise<void> {
  const state = await getSyncState();
  await runInitialAndBackgroundSync(state.syncMode === "all" ? "all" : "recent", onProgress);
}

async function runInitialAndBackgroundSyncUnlocked(
  syncMode: SyncMode,
  onProgress?: ProgressCallback
): Promise<void> {
  const { getAccountEmail } = await import("./auth");
  const email = getAccountEmail();
  const provider = await getProviderForAccount(email);

  if (provider && provider.type === "imap") {
    await runImapInitialSync(provider, onProgress);
    return;
  }

  await updateSyncState({
    syncMode,
    status: "syncing",
    phase: "initial",
    progressCurrent: 0,
    progressTotal: INITIAL_SYNC_TARGET,
    initialSyncCompletedAt: null,
    fullSyncCompletedAt: null,
    backgroundSyncCursor: null,
    backgroundSyncTotal: null,
    backgroundSyncProcessed: 0,
    backgroundSyncPending: false,
    backgroundSyncLastBatchAt: null,
    error: null,
  });

  try {
    const initialResult = await runSyncPass({
      phase: "initial",
      limit: INITIAL_SYNC_TARGET,
      onProgress,
    });
    const initialCompletedAt = Date.now();
    const initialProgressTotal = Math.min(
      initialResult.totalEstimate,
      INITIAL_SYNC_TARGET
    );

    await updateSyncState({
      historyId: initialResult.latestHistoryId,
      lastSyncAt: initialCompletedAt,
      initialSyncCompletedAt: initialCompletedAt,
      syncMode,
      progressCurrent: Math.min(initialResult.processed, initialProgressTotal),
      progressTotal: initialProgressTotal,
      status: "idle",
      phase: null,
      error: null,
    });

    const hasMoreToSync =
      initialResult.totalEstimate > initialResult.processed &&
      initialResult.nextPageToken !== undefined;

    if (syncMode === "recent" || !hasMoreToSync) {
      await updateSyncState({
        fullSyncCompletedAt: initialCompletedAt,
        backgroundSyncCursor: null,
        backgroundSyncTotal: initialResult.totalEstimate,
        backgroundSyncProcessed: initialResult.processed,
        backgroundSyncPending: false,
        backgroundSyncLastBatchAt: null,
        metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
        status: "idle",
        phase: null,
      });
      console.log(`Initial sync complete: ${initialResult.processed} messages`);
      return;
    }

    await updateSyncState({
      historyId: initialResult.latestHistoryId,
      lastSyncAt: initialCompletedAt,
      fullSyncCompletedAt: null,
      backgroundSyncCursor: initialResult.nextPageToken ?? null,
      backgroundSyncTotal: initialResult.totalEstimate,
      backgroundSyncProcessed: initialResult.processed,
      backgroundSyncPending: true,
      backgroundSyncLastBatchAt: initialCompletedAt,
      metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
      progressCurrent: Math.min(initialResult.processed, initialResult.totalEstimate),
      progressTotal: initialResult.totalEstimate,
      status: "idle",
      phase: null,
      error: null,
    });

    console.log(
      `Initial sync complete: ${initialResult.processed} messages. Deferred full sync is queued.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSyncState({
      status: "error",
      phase: null,
      error: message,
    });
    throw err;
  }
}

export async function runInitialAndBackgroundSync(
  syncMode: SyncMode = "recent",
  onProgress?: ProgressCallback
): Promise<void> {
  const result = await withSyncLock(() =>
    runInitialAndBackgroundSyncUnlocked(syncMode, onProgress)
  );

  if (result === "locked") {
    console.log("Sync already in progress — skipping duplicate");
  }
}

// ── IMAP sync ──

async function runImapInitialSync(
  provider: EmailProvider,
  onProgress?: ProgressCallback
): Promise<void> {
  await updateSyncState({
    syncMode: "recent",
    status: "syncing",
    phase: "initial",
    progressCurrent: 0,
    progressTotal: 100,
    initialSyncCompletedAt: null,
    fullSyncCompletedAt: null,
    error: null,
  });

  try {
    if (!("listFolders" in provider) || !("fetchFolderMessages" in provider)) {
      throw new Error("Provider does not support folder listing");
    }

    const imapProvider = provider as import("./imap-provider").ImapProvider;
    const folders = await imapProvider.listFolders();

    const primaryFolders = folders.filter((f) =>
      ["inbox", "sent"].includes(f.kind)
    );
    const otherFolders = folders.filter((f) =>
      !["inbox", "sent"].includes(f.kind)
    );
    const orderedFolders = [...primaryFolders, ...otherFolders];
    const progressTotal = orderedFolders.length || 1;

    await updateSyncState({
      status: "syncing",
      phase: "initial",
      progressCurrent: 0,
      progressTotal,
      error: null,
    });

    let totalMessages = 0;

    for (let i = 0; i < orderedFolders.length; i++) {
      const f = orderedFolders[i];
      const messages = await imapProvider.fetchFolderMessages(f.kind as any);

      const toInsert = messages.map(fetchedMessageToInsert);
      if (toInsert.length > 0) {
        await insertMessages(toInsert);
        processSubscriptions(toInsert);
        totalMessages += toInsert.length;
      }

      await updateSyncState({
        status: "syncing",
        phase: "initial",
        progressCurrent: i + 1,
        progressTotal,
        error: null,
      });
      onProgress?.({ current: i + 1, total: progressTotal });
    }

    const completedAt = Date.now();
    await updateSyncState({
      lastSyncAt: completedAt,
      initialSyncCompletedAt: completedAt,
      fullSyncCompletedAt: completedAt,
      status: "idle",
      phase: null,
      progressCurrent: progressTotal,
      progressTotal,
      error: null,
      metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
    });

    console.log(`IMAP initial sync complete: ${totalMessages} messages from ${orderedFolders.length} folders`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSyncState({
      status: "error",
      phase: null,
      error: message,
    });
    throw err;
  }
}

export async function doImapIncrementalSync(): Promise<{
  newMessages: number;
  hadGap: boolean;
}> {
  const { getAccountEmail } = await import("./auth");
  const email = getAccountEmail();
  const provider = await getProviderForAccount(email);

  if (!provider || provider.type !== "imap") {
    return { newMessages: 0, hadGap: false };
  }

  const lockResult = await withSyncLock(async () => {
    const gen = getCurrentSyncGeneration();
    await updateSyncState({
      status: "syncing",
      phase: "background",
      progressCurrent: null,
      progressTotal: null,
      error: null,
    });

    try {
      const imapProvider = provider as import("./imap-provider").ImapProvider;
      const folders = await imapProvider.listFolders();

      let newCount = 0;

      for (const f of folders) {
        checkSyncCancelled(gen);
        const folderSync = await getImapFolderSync(f.path);

      const messages = await imapProvider.fetchFolderMessages(f.kind as any, f.path);
        const existingCount = folderSync ? folderSync.uidNext : 0;

        const newMessages = messages.filter((m) => {
          const uid = parseInt(m.id.split(":").pop() ?? "0", 10);
          return uid > existingCount;
        });

        if (newMessages.length > 0) {
          const toInsert = newMessages.map(fetchedMessageToInsert);
          await insertMessages(toInsert);
          processSubscriptions(toInsert);
          newCount += toInsert.length;
        }

        if (messages.length > 0) {
          const maxUid = Math.max(
            ...messages.map((m) => parseInt(m.id.split(":").pop() ?? "0", 10))
          );
          await upsertImapFolderSync(f.path, {
            uidValidity: 1,
            uidNext: maxUid,
            lastSyncAt: Date.now(),
          });
        }
      }

      await updateSyncState({
        lastSyncAt: Date.now(),
        status: "idle",
        phase: null,
        progressCurrent: null,
        progressTotal: null,
        error: null,
      });

      return { newMessages: newCount, hadGap: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSyncState({ status: "error", phase: null, error: message });
      throw err;
    }
  });

  if (lockResult === "locked") {
    return { newMessages: 0, hadGap: false };
  }

  return lockResult;
}

// ── Gmail incremental sync (unchanged architecture) ──

export async function doIncrementalSync(): Promise<{
  newMessages: number;
  hadGap: boolean;
  messages: GmailMessage[];
}> {
  const { getAccountEmail } = await import("./auth");
  const email = getAccountEmail();
  const provider = await getProviderForAccount(email);

  if (provider && provider.type === "imap") {
    const result = await doImapIncrementalSync();
    return { ...result, messages: [] };
  }

  const state = await getSyncState();
  if (!state.historyId) {
    if (state.status === "syncing") {
      return { newMessages: 0, hadGap: false, messages: [] };
    }
    console.log("No historyId — running initial sync instead");
    await runInitialAndBackgroundSync(state.syncMode === "all" ? "all" : "recent");
    return { newMessages: 0, hadGap: false, messages: [] };
  }

  const lockResult = await withSyncLock(async () => {
    const gen = getCurrentSyncGeneration();
    await updateSyncState({
      status: "syncing",
      phase: "background",
      progressCurrent: null,
      progressTotal: null,
      error: null,
    });

    try {
      const { getValidAccessToken } = await import("./auth");
      const accessToken = await getValidAccessToken();
      let hadGap = false;
      let newCount = 0;
      let needsFullResync = false;
      const newMessages: GmailMessage[] = [];

      try {
        const addedIds = new Set<string>();
        const relabeledIds = new Set<string>();
        let nextPageToken: string | undefined;
        let latestHistoryId = state.historyId;

        do {
          checkSyncCancelled(gen);
          const history = await withRetry(() =>
            getHistory(accessToken, state.historyId!, { pageToken: nextPageToken })
          );

          if (history.historyId) {
            latestHistoryId = history.historyId;
          }

          for (const item of history.history ?? []) {
            for (const added of item.messagesAdded ?? []) {
              addedIds.add(added.message.id);
            }
            for (const relabeled of item.labelsAdded ?? []) {
              relabeledIds.add(relabeled.message.id);
            }
            for (const relabeled of item.labelsRemoved ?? []) {
              relabeledIds.add(relabeled.message.id);
            }
          }

          nextPageToken = history.nextPageToken;
        } while (nextPageToken);

        if (addedIds.size > 0) {
          checkSyncCancelled(gen);
          const ids = Array.from(addedIds);

          const fetched = await fetchMessagesPool(ids, accessToken, FETCH_CONCURRENCY, getMessage, gen);

          if (fetched.length > 0) {
            await flushInsertBuffer(fetched, accessToken);
            newMessages.push(...fetched);
          }
          newCount += fetched.length;
        }

        const metadataOnlyIds = Array.from(relabeledIds).filter(
          (id) => !addedIds.has(id)
        );
        if (metadataOnlyIds.length > 0) {
          checkSyncCancelled(gen);
          const fetchedMetadata = await fetchMessagesPool(
            metadataOnlyIds,
            accessToken,
            FETCH_CONCURRENCY,
            getMessageMetadata,
            gen
          );
          if (fetchedMetadata.length > 0) {
            const metadata = fetchedMetadata.map(toStoredMessageMetadata);
            await upsertMessageMetadata(metadata);
            processSubscriptions(metadata);
          }
        }

        if (latestHistoryId) {
          await updateSyncState({
            historyId: latestHistoryId,
            lastSyncAt: Date.now(),
            metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
            phase: null,
            progressCurrent: null,
            progressTotal: null,
            status: "idle",
            error: null,
          });
        }
      } catch (err) {
        if (err instanceof HistoryGapError) {
          console.log("History gap detected — scheduling full re-sync");
          hadGap = true;
          needsFullResync = true;
          await updateSyncState({
            status: "idle",
            phase: null,
            progressCurrent: null,
            progressTotal: null,
            error: null,
          });
        } else {
          throw err;
        }
      }

      return {
        newMessages: newCount,
        hadGap,
        needsFullResync,
        messages: newMessages,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSyncState({ status: "error", phase: null, error: message });
      throw err;
    }
  });

  if (lockResult === "locked") {
    return { newMessages: 0, hadGap: false, messages: [] };
  }

  if (lockResult.needsFullResync) {
    await clearMessages();
    await runInitialAndBackgroundSync(state.syncMode === "all" ? "all" : "recent");
    return { newMessages: 0, hadGap: true, messages: [] };
  }

  return {
    newMessages: lockResult.newMessages,
    hadGap: lockResult.hadGap,
    messages: lockResult.messages,
  };
}

export async function continueDeferredFullSyncIfDue(): Promise<{
  ran: boolean;
  completed: boolean;
  nextRunInMs?: number;
}> {
  const state = await getSyncState();
  if (!state.backgroundSyncPending || !state.backgroundSyncCursor) {
    return { ran: false, completed: true };
  }

  const lastBatchAt = state.backgroundSyncLastBatchAt ?? 0;
  const elapsedMs = Date.now() - lastBatchAt;
  if (elapsedMs < DEFERRED_FULL_SYNC_INTERVAL_MS) {
    return {
      ran: false,
      completed: false,
      nextRunInMs: DEFERRED_FULL_SYNC_INTERVAL_MS - elapsedMs,
    };
  }

  const result = await withSyncLock(async () => {
    await updateSyncState({
      syncMode: "all",
      status: "syncing",
      phase: "background",
      progressCurrent: state.backgroundSyncProcessed,
      progressTotal: state.backgroundSyncTotal,
      error: null,
    });

    try {
      const backgroundResult = await runSyncPass({
        phase: "background",
        limit: DEFERRED_FULL_SYNC_BATCH_TARGET,
        startPageToken: state.backgroundSyncCursor ?? undefined,
        totalEstimate: state.backgroundSyncTotal ?? undefined,
        processedBeforeStart: state.backgroundSyncProcessed,
        latestHistoryId: state.historyId ?? undefined,
      });
      const completed =
        backgroundResult.nextPageToken === undefined ||
        backgroundResult.processed >= backgroundResult.totalEstimate;
      const completedAt = Date.now();

      await updateSyncState({
        historyId: backgroundResult.latestHistoryId,
        lastSyncAt: completedAt,
        fullSyncCompletedAt: completed ? completedAt : null,
        backgroundSyncCursor: backgroundResult.nextPageToken ?? null,
        backgroundSyncTotal: backgroundResult.totalEstimate,
        backgroundSyncProcessed: backgroundResult.processed,
        backgroundSyncPending: !completed,
        backgroundSyncLastBatchAt: completedAt,
        metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
        progressCurrent: backgroundResult.processed,
        progressTotal: backgroundResult.totalEstimate,
        status: "idle",
        phase: null,
        error: null,
      });

      if (completed) {
        console.log(`Full sync complete: ${backgroundResult.processed} messages`);
      } else {
        console.log(
          `Deferred full sync advanced to ${backgroundResult.processed}/${backgroundResult.totalEstimate}`
        );
      }

      return {
        ran: true,
        completed,
        nextRunInMs: completed ? undefined : DEFERRED_FULL_SYNC_INTERVAL_MS,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSyncState({ status: "error", phase: null, error: message });
      throw err;
    }
  });

  if (result === "locked") {
    return { ran: false, completed: false };
  }

  return result;
}

export async function runMessageMetadataBackfillIfNeeded(): Promise<void> {
  const state = await getSyncState();
  if (state.metadataSchemaVersion >= CURRENT_METADATA_SCHEMA_VERSION) {
    return;
  }

  const totalMessages = await getMessageCount();
  if (totalMessages === 0) {
    await updateSyncState({
      metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
    });
    return;
  }

  const result = await withSyncLock(async () => {
    const gen = getCurrentSyncGeneration();
    await updateSyncState({
      status: "syncing",
      phase: "background",
      progressCurrent: 0,
      progressTotal: totalMessages,
      error: null,
    });

    try {
      const { getValidAccessToken } = await import("./auth");
      const accessToken = await getValidAccessToken();
      let processed = 0;

      for (
        let offset = 0;
        offset < totalMessages;
        offset += MESSAGE_METADATA_BATCH_SIZE
      ) {
        checkSyncCancelled(gen);
        const ids = await listMessageIds(MESSAGE_METADATA_BATCH_SIZE, offset);
        if (ids.length === 0) break;

        const fetchedMetadata = await fetchMessagesPool(
          ids,
          accessToken,
          FETCH_CONCURRENCY,
          getMessageMetadata,
          gen
        );
        if (fetchedMetadata.length > 0) {
          const metadata = fetchedMetadata.map(toStoredMessageMetadata);
          await upsertMessageMetadata(metadata);
          processSubscriptions(metadata);
        }

        processed += ids.length;
        await updateSyncState({
          status: "syncing",
          phase: "background",
          progressCurrent: Math.min(processed, totalMessages),
          progressTotal: totalMessages,
          error: null,
        });
      }

      await updateSyncState({
        lastSyncAt: Date.now(),
        metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
        status: "idle",
        phase: null,
        progressCurrent: null,
        progressTotal: null,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSyncState({ status: "error", phase: null, error: message });
      throw err;
    }
  });

  if (result === "locked") {
    console.log("Sync already in progress — skipping metadata backfill");
  }
}

export async function startIncrementalSyncPolling(
  _onNewMail?: (message: GmailMessage) => void
): Promise<() => void> {
  let running = true;
  let emptyPolls = 0;
  let nextDelayMs = FAST_POLL_INTERVAL_MS;

  async function poll() {
    while (running) {
      try {
        const result = await doIncrementalSync();
        if (result.newMessages > 0) {
          console.log(`Incremental sync: ${result.newMessages} new messages`);
          for (const message of result.messages) {
            if (getMailboxFlags(message.labelIds).isInbox) {
              _onNewMail?.(message);
            }
          }
          emptyPolls = 0;
          nextDelayMs = FAST_POLL_INTERVAL_MS;
        } else {
          emptyPolls += 1;
          if (emptyPolls >= EMPTY_POLLS_BEFORE_IDLE) {
            nextDelayMs = IDLE_POLL_INTERVAL_MS;
          }
        }
      } catch (err) {
        console.error("Incremental sync failed:", err);
        nextDelayMs = ERROR_POLL_INTERVAL_MS;
      }

      await Bun.sleep(nextDelayMs);
    }
  }

  poll();

  return () => {
    running = false;
  };
}

export { getMailboxFlags };
