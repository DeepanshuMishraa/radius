import {
  getRefreshToken,
  refreshAccessToken,
  type TokenData,
} from "./auth";
import {
  insertMessage,
  updateSyncState,
  getSyncState,
  clearMessages,
} from "./db";
import {
  listMessages,
  getMessage,
  getHistory,
  extractBodies,
  parseHeaders,
  GmailAPIError,
  HistoryGapError,
  type GmailMessage,
} from "./gmail";

let currentAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function ensureAccessToken(): Promise<string> {
  if (currentAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return currentAccessToken;
  }

  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token found — please authenticate first");
  }

  const refreshed = await refreshAccessToken(refreshToken);
  currentAccessToken = refreshed.access_token;
  tokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
  return currentAccessToken;
}

export function setTokens(tokens: TokenData): void {
  currentAccessToken = tokens.access_token;
  tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
}

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
        if (err.isAuthError()) {
          // Force token refresh on next call
          currentAccessToken = null;
          if (attempt < maxRetries) {
            await Bun.sleep(500);
            continue;
          }
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

export async function doFullSync(
  onProgress?: ProgressCallback
): Promise<void> {
  await updateSyncState({ status: "syncing" });

  try {
    const accessToken = await ensureAccessToken();

    // Get total estimate
    const firstPage = await withRetry(() =>
      listMessages(accessToken, { maxResults: 1, q: "in:inbox" })
    );
    const totalEstimate = firstPage.resultSizeEstimate ?? 1000;

    let pageToken: string | undefined;
    let processed = 0;
    const batchSize = 5; // concurrency limit
    const insertBatchSize = 50;
    let insertBuffer: GmailMessage[] = [];

    do {
      const page = await withRetry(() =>
        listMessages(accessToken, {
          maxResults: 500,
          pageToken,
          q: "in:inbox",
        })
      );

      const messages = page.messages ?? [];
      if (messages.length === 0) break;

      // Fetch in batches of 5 concurrently
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const fetched = await Promise.all(
          batch.map((m) =>
            withRetry(() => getMessage(accessToken, m.id)).catch((err) => {
              console.error(`Failed to fetch message ${m.id}:`, err);
              return null;
            })
          )
        );

        const valid = fetched.filter((m): m is GmailMessage => m !== null);
        insertBuffer.push(...valid);

        // Insert in batches of 50
        if (insertBuffer.length >= insertBatchSize) {
          await flushInsertBuffer(insertBuffer);
          processed += insertBuffer.length;
          insertBuffer = [];

          onProgress?.({ current: processed, total: totalEstimate });
          await Bun.sleep(0); // Yield event loop
        }
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

    // Flush remaining
    if (insertBuffer.length > 0) {
      await flushInsertBuffer(insertBuffer);
      processed += insertBuffer.length;
      onProgress?.({ current: processed, total: totalEstimate });
    }

    // Get latest historyId
    const accessToken2 = await ensureAccessToken();
    const latest = await withRetry(() =>
      listMessages(accessToken2, { maxResults: 1, q: "in:inbox" })
    );
    if (latest.messages && latest.messages.length > 0) {
      const msg = await withRetry(() =>
        getMessage(accessToken2, latest.messages![0].id)
      );
      await updateSyncState({
        historyId: msg.historyId,
        lastSyncAt: Date.now(),
        fullSyncCompletedAt: Date.now(),
        status: "idle",
      });
    } else {
      await updateSyncState({
        lastSyncAt: Date.now(),
        fullSyncCompletedAt: Date.now(),
        status: "idle",
      });
    }

    console.log(`Full sync complete: ${processed} messages`);
  } catch (err) {
    await updateSyncState({ status: "error" });
    throw err;
  }
}

export async function doIncrementalSync(): Promise<{
  newMessages: number;
  hadGap: boolean;
}> {
  const state = await getSyncState();
  if (!state.historyId) {
    console.log("No historyId — running full sync instead");
    await doFullSync();
    return { newMessages: 0, hadGap: false };
  }

  await updateSyncState({ status: "syncing" });

  try {
    const accessToken = await ensureAccessToken();
    let hadGap = false;
    let newCount = 0;

    try {
      const history = await withRetry(() =>
        getHistory(accessToken, state.historyId!)
      );

      const addedIds = new Set<string>();
      for (const item of history.history ?? []) {
        for (const added of item.messagesAdded ?? []) {
          addedIds.add(added.message.id);
        }
      }

      if (addedIds.size > 0) {
        const ids = Array.from(addedIds);
        const batchSize = 5;

        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const fetched = await Promise.all(
            batch.map((id) =>
              withRetry(() => getMessage(accessToken, id)).catch(() => null)
            )
          );

          const valid = fetched.filter((m): m is GmailMessage => m !== null);
          await flushInsertBuffer(valid);
          newCount += valid.length;
          await Bun.sleep(0);
        }
      }

      if (history.historyId) {
        await updateSyncState({
          historyId: history.historyId,
          lastSyncAt: Date.now(),
          status: "idle",
        });
      }
    } catch (err) {
      if (err instanceof HistoryGapError) {
        console.log("History gap detected — running full re-sync");
        hadGap = true;
        await clearMessages();
        await doFullSync();
      } else {
        throw err;
      }
    }

    return { newMessages: newCount, hadGap };
  } catch (err) {
    await updateSyncState({ status: "error" });
    throw err;
  }
}

async function flushInsertBuffer(messages: GmailMessage[]): Promise<void> {
  for (const msg of messages) {
    const bodies = extractBodies(msg.payload);
    const headers = parseHeaders(msg.payload.headers);

    await insertMessage({
      id: msg.id,
      threadId: msg.threadId,
      historyId: msg.historyId,
      internalDate: parseInt(msg.internalDate, 10),
      from: headers["from"] ?? "",
      subject: headers["subject"] ?? "",
      snippet: msg.snippet,
      bodyText: bodies.text,
      bodyHtml: bodies.html,
    });
  }
}

export async function startIncrementalSyncPolling(
  onNewMail?: (message: GmailMessage) => void
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

      // Wait 30s before next poll
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
