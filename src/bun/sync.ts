import { getValidAccessToken } from "./auth";
import {
  insertMessages,
  updateSyncState,
  getSyncState,
  clearMessages,
  getMessageCount,
  listMessageIds,
  upsertMessageMetadata,
} from "./db";
import {
  listMessages,
  getMessage,
  getMessageMetadata,
  getHistory,
  extractBodies,
  parseHeaders,
  classifyFromLabels,
  isReadFromLabels,
  GmailAPIError,
  HistoryGapError,
  type GmailMessage,
} from "./gmail";

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

const INITIAL_SYNC_TARGET = 1000;
const PAGE_SIZE = 500;
const FETCH_CONCURRENCY = 15;
const INSERT_BATCH_SIZE = 50;
const MESSAGE_METADATA_BATCH_SIZE = 250;
const CURRENT_METADATA_SCHEMA_VERSION = 1;

let syncLock = false;

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T | "locked"> {
  if (syncLock) return "locked";
  syncLock = true;
  try {
    return await fn();
  } finally {
    syncLock = false;
  }
}

async function fetchMessagesPool(
  ids: string[],
  accessToken: string,
  concurrency: number,
  fetcher: (accessToken: string, messageId: string) => Promise<GmailMessage> = getMessage
): Promise<GmailMessage[]> {
  const results: GmailMessage[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < ids.length) {
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
    category: classifyFromLabels(msg.labelIds),
    isRead: isReadFromLabels(msg.labelIds),
  };
}

interface SyncRunOptions {
  phase: SyncPhase;
  limit?: number;
  startPageToken?: string;
  totalEstimate?: number;
  processedBeforeStart?: number;
  latestHistoryId?: string;
  onProgress?: ProgressCallback;
}

interface SyncRunResult {
  processed: number;
  totalEstimate: number;
  nextPageToken?: string;
  latestHistoryId?: string;
}

async function pushSyncProgress(
  phase: SyncPhase,
  progress: SyncProgress,
  latestHistoryId?: string
): Promise<void> {
  await updateSyncState({
    status: "syncing",
    phase,
    progressCurrent: progress.current,
    progressTotal: progress.total,
    historyId: latestHistoryId,
    error: null,
  });
}

async function runSyncPass({
  phase,
  limit,
  startPageToken,
  totalEstimate,
  processedBeforeStart = 0,
  latestHistoryId,
  onProgress,
}: SyncRunOptions): Promise<SyncRunResult> {
  const accessToken = await getValidAccessToken();
  const firstPage =
    totalEstimate === undefined
      ? await withRetry(() =>
          listMessages(accessToken, { maxResults: 1, q: "in:inbox" })
        )
      : null;
  const resolvedTotalEstimate =
    totalEstimate ?? firstPage?.resultSizeEstimate ?? INITIAL_SYNC_TARGET;
  const progressTotal =
    phase === "initial"
      ? Math.min(limit ?? INITIAL_SYNC_TARGET, resolvedTotalEstimate)
      : resolvedTotalEstimate;

  let pageToken = startPageToken;
  let processed = processedBeforeStart;
  let insertBuffer: GmailMessage[] = [];

  await pushSyncProgress(
    phase,
    {
      current: Math.min(processed, progressTotal),
      total: progressTotal,
    },
    latestHistoryId
  );

  do {
    const page = await withRetry(() =>
      listMessages(accessToken, {
        maxResults: PAGE_SIZE,
        pageToken,
        q: "in:inbox",
      })
    );

    const pageMessages = page.messages ?? [];
    if (pageMessages.length === 0) {
      pageToken = undefined;
      break;
    }

    const remaining =
      limit === undefined ? pageMessages.length : Math.max(limit - processed, 0);
    const messagesToFetch =
      limit === undefined ? pageMessages : pageMessages.slice(0, remaining);

    const ids = messagesToFetch.map((m) => m.id);
    const fetched = await fetchMessagesPool(ids, accessToken, FETCH_CONCURRENCY);

    if (!latestHistoryId && fetched.length > 0) {
      latestHistoryId = fetched[0].historyId;
    }

    for (let i = 0; i < fetched.length; i += INSERT_BATCH_SIZE) {
      const chunk = fetched.slice(i, i + INSERT_BATCH_SIZE);
      await flushInsertBuffer(chunk, accessToken);
      processed += chunk.length;

      const progress = {
        current: Math.min(processed, progressTotal),
        total: progressTotal,
      };
      await pushSyncProgress(phase, progress, latestHistoryId);
      onProgress?.(progress);
    }

    pageToken = page.nextPageToken;
    if (limit !== undefined && processed >= limit) {
      break;
    }
  } while (pageToken);

  if (insertBuffer.length > 0) {
    await flushInsertBuffer(insertBuffer, accessToken);
    processed += insertBuffer.length;
    const progress = {
      current: Math.min(processed, progressTotal),
      total: progressTotal,
    };
    await pushSyncProgress(phase, progress, latestHistoryId);
    onProgress?.(progress);
  }

  return {
    processed,
    totalEstimate: resolvedTotalEstimate,
    nextPageToken: pageToken,
    latestHistoryId,
  };
}

export async function doFullSync(
  onProgress?: ProgressCallback
): Promise<void> {
  await runInitialAndBackgroundSync(onProgress);
}

async function runInitialAndBackgroundSyncUnlocked(
  onProgress?: ProgressCallback
): Promise<void> {
  await updateSyncState({
    status: "syncing",
    phase: "initial",
    progressCurrent: 0,
    progressTotal: INITIAL_SYNC_TARGET,
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
      progressCurrent: Math.min(initialResult.processed, initialProgressTotal),
      progressTotal: initialProgressTotal,
      status: "idle",
      phase: null,
      error: null,
    });

    const hasMoreToSync =
      initialResult.totalEstimate > initialResult.processed &&
      initialResult.nextPageToken !== undefined;

    if (!hasMoreToSync) {
      await updateSyncState({
        fullSyncCompletedAt: initialCompletedAt,
        metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
        status: "idle",
        phase: null,
      });
      console.log(`Initial sync complete: ${initialResult.processed} messages`);
      return;
    }

    const backgroundResult = await runSyncPass({
      phase: "background",
      startPageToken: initialResult.nextPageToken,
      totalEstimate: initialResult.totalEstimate,
      processedBeforeStart: initialResult.processed,
      latestHistoryId: initialResult.latestHistoryId,
    });

    await updateSyncState({
      historyId: backgroundResult.latestHistoryId,
      lastSyncAt: Date.now(),
      fullSyncCompletedAt: Date.now(),
      metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
      progressCurrent: backgroundResult.processed,
      progressTotal: backgroundResult.totalEstimate,
      status: "idle",
      phase: null,
      error: null,
    });

    console.log(`Full sync complete: ${backgroundResult.processed} messages`);
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
  onProgress?: ProgressCallback
): Promise<void> {
  const result = await withSyncLock(() =>
    runInitialAndBackgroundSyncUnlocked(onProgress)
  );

  if (result === "locked") {
    console.log("Sync already in progress — skipping duplicate");
  }
}

export async function runBackgroundCatchupSync(): Promise<void> {
  const result = await withSyncLock(async () => {
    await updateSyncState({
      status: "syncing",
      phase: "background",
      progressCurrent: 0,
      progressTotal: null,
      error: null,
    });

    try {
      const backgroundResult = await runSyncPass({
        phase: "background",
      });

      await updateSyncState({
        historyId: backgroundResult.latestHistoryId,
        lastSyncAt: Date.now(),
        fullSyncCompletedAt: Date.now(),
        metadataSchemaVersion: CURRENT_METADATA_SCHEMA_VERSION,
        progressCurrent: backgroundResult.processed,
        progressTotal: backgroundResult.totalEstimate,
        status: "idle",
        phase: null,
        error: null,
      });

      console.log(`Background catch-up complete: ${backgroundResult.processed} messages`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSyncState({ status: "error", phase: null, error: message });
      throw err;
    }
  });

  if (result === "locked") {
    console.log("Sync already in progress — skipping duplicate");
  }
}

export async function doIncrementalSync(): Promise<{
  newMessages: number;
  hadGap: boolean;
}> {
  const state = await getSyncState();
  if (!state.historyId) {
    console.log("No historyId — running full sync instead");
    await runInitialAndBackgroundSync();
    return { newMessages: 0, hadGap: false };
  }

  const lockResult = await withSyncLock(async () => {
    await updateSyncState({
      status: "syncing",
      phase: "background",
      progressCurrent: null,
      progressTotal: null,
      error: null,
    });

    try {
      const accessToken = await getValidAccessToken();
      let hadGap = false;
      let newCount = 0;
      let needsFullResync = false;

      try {
        const addedIds = new Set<string>();
        const relabeledIds = new Set<string>();
        let nextPageToken: string | undefined;
        let latestHistoryId = state.historyId;

        do {
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
          const ids = Array.from(addedIds);

          const fetched = await fetchMessagesPool(ids, accessToken, FETCH_CONCURRENCY);

          if (fetched.length > 0) {
            await flushInsertBuffer(fetched, accessToken);
          }
          newCount += fetched.length;
        }

        const metadataOnlyIds = Array.from(relabeledIds).filter(
          (id) => !addedIds.has(id)
        );
        if (metadataOnlyIds.length > 0) {
          const fetchedMetadata = await fetchMessagesPool(
            metadataOnlyIds,
            accessToken,
            FETCH_CONCURRENCY,
            getMessageMetadata
          );
          if (fetchedMetadata.length > 0) {
            await upsertMessageMetadata(
              fetchedMetadata.map(toStoredMessageMetadata)
            );
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

      return { newMessages: newCount, hadGap, needsFullResync };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSyncState({ status: "error", phase: null, error: message });
      throw err;
    }
  });

  if (lockResult === "locked") {
    return { newMessages: 0, hadGap: false };
  }

  if (lockResult.needsFullResync) {
    await clearMessages();
    await runInitialAndBackgroundSync();
    return { newMessages: 0, hadGap: true };
  }

  return { newMessages: lockResult.newMessages, hadGap: lockResult.hadGap };
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
    await updateSyncState({
      status: "syncing",
      phase: "background",
      progressCurrent: 0,
      progressTotal: totalMessages,
      error: null,
    });

    try {
      const accessToken = await getValidAccessToken();
      let processed = 0;

      for (
        let offset = 0;
        offset < totalMessages;
        offset += MESSAGE_METADATA_BATCH_SIZE
      ) {
        const ids = await listMessageIds(MESSAGE_METADATA_BATCH_SIZE, offset);
        if (ids.length === 0) break;

        const fetchedMetadata = await fetchMessagesPool(
          ids,
          accessToken,
          FETCH_CONCURRENCY,
          getMessageMetadata
        );
        if (fetchedMetadata.length > 0) {
          await upsertMessageMetadata(
            fetchedMetadata.map(toStoredMessageMetadata)
          );
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

async function flushInsertBuffer(
  messages: GmailMessage[],
  accessToken: string
): Promise<void> {
  const toInsert = await Promise.all(
    messages.map(async (msg) => {
      const bodies = await extractBodies(msg.payload, accessToken, msg.id);
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
        category: classifyFromLabels(msg.labelIds),
        isRead: isReadFromLabels(msg.labelIds),
      };
    })
  );

  await insertMessages(toInsert);
}

export async function startIncrementalSyncPolling(
  _onNewMail?: (message: GmailMessage) => void
): Promise<() => void> {
  let running = true;

  async function poll() {
    while (running) {
      try {
        const result = await doIncrementalSync();
        if (result.newMessages > 0) {
          console.log(`Incremental sync: ${result.newMessages} new messages`);
        }
      } catch (err) {
        console.error("Incremental sync failed:", err);
      }

      for (let i = 0; i < 30 && running; i++) {
        await Bun.sleep(1000);
      }
    }
  }

  poll();

  return () => {
    running = false;
  };
}
