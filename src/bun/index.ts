import Electrobun, { BrowserWindow, BrowserView, Utils, ApplicationMenu, Updater } from "electrobun/bun";
import { spawn } from "node:child_process";
import type { RadiusRPC } from "../shared/types";
import type { SyncMode } from "../shared/types";
import {
  createSchema,
  getInboxMessages,
  getMessageById,
  getSyncState,
  searchInboxMessages,
  updateSyncState,
  updateMessageBodies,
  setMessageReadState,
} from "./db";
import {
  buildAuthURL,
  exchangeCodeForTokens,
  storeRefreshToken,
  generateCodeVerifier,
  sha256,
  setTokens,
  getRefreshToken,
  getValidAccessToken,
} from "./auth";
import {
  getMessage as getGmailMessage,
  extractBodies,
  modifyMessageLabels,
  GmailAPIError,
  parseHeaders,
  classifyMessageNature,
  isReadFromLabels,
} from "./gmail";
import {
  runInitialAndBackgroundSync,
  continueDeferredFullSyncIfDue,
  startIncrementalSyncPolling,
  doIncrementalSync,
  runMessageMetadataBackfillIfNeeded,
} from "./sync";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      return DEV_SERVER_URL;
    } catch {
      /* fallthrough */
    }
  }
  return "views://mainview/index.html";
}

let codeVerifier: string | null = null;
let authServer: ReturnType<typeof Bun.serve> | null = null;
let stopPolling: (() => void) | null = null;
let stopDeferredFullSync: (() => void) | null = null;
let emitNewMailToRenderer: (message: Awaited<ReturnType<typeof getGmailMessage>>) => void =
  () => {};

// ── Updater serialization guard ──
// Electrobun's Updater is process-global; only one operation at a time.
let updaterLock: Promise<unknown> = Promise.resolve();

function withUpdaterLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = updaterLock.then(() => fn()).catch(() => fn());
  updaterLock = next;
  return next as Promise<T>;
}

function stopDeferredFullSyncScheduler() {
  stopDeferredFullSync?.();
  stopDeferredFullSync = null;
}

function startDeferredFullSyncScheduler() {
  stopDeferredFullSyncScheduler();

  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = (delayMs: number) => {
    timeoutId = setTimeout(async () => {
      if (stopped) return;

      try {
        const result = await continueDeferredFullSyncIfDue();
        if (stopped || result.completed) {
          if (result.completed) {
            stopDeferredFullSyncScheduler();
          }
          return;
        }
        scheduleNext(result.nextRunInMs ?? 60 * 60 * 1000);
      } catch (err) {
        console.error("❌ Deferred full sync failed:", err);
        scheduleNext(60 * 60 * 1000);
      }
    }, delayMs);
  };

  scheduleNext(0);

  stopDeferredFullSync = () => {
    stopped = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}

function toRpcMessage(gmailMessage: Awaited<ReturnType<typeof getGmailMessage>>) {
  const headers = parseHeaders(gmailMessage.payload.headers ?? []);

  return {
    id: gmailMessage.id,
    threadId: gmailMessage.threadId,
    historyId: gmailMessage.historyId,
    internalDate: parseInt(gmailMessage.internalDate, 10),
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    snippet: gmailMessage.snippet,
    bodyText: null,
    bodyHtml: null,
    category: classifyMessageNature({
      labelIds: gmailMessage.labelIds,
      from: headers["from"],
      subject: headers["subject"],
      snippet: gmailMessage.snippet,
    }),
    isRead: isReadFromLabels(gmailMessage.labelIds),
  } satisfies RadiusRPC["bun"]["requests"]["getMessage"]["response"];
}

function showNewMailNotification(message: RadiusRPC["bun"]["requests"]["getMessage"]["response"]) {
  if (!message || message.isRead) return;

  const sender = message.from?.split("<")[0].trim() || message.from || "Radius";
  Utils.showNotification({
    title: sender,
    subtitle: "New mail in Radius",
    body: message.subject || message.snippet || "You received a new email",
    silent: false,
  });
}

function normalizeMessageRecord(
  message: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!message) return null;

  return {
    ...message,
    category:
      typeof message.category === "string" ? message.category : "regular",
    isRead: Boolean(message.isRead),
  };
}

function normalizeMessageListRecord(
  message: Record<string, unknown>
): Record<string, unknown> {
  return normalizeMessageRecord(message) ?? message;
}

async function handleOAuthCallback(code: string, syncMode: SyncMode): Promise<void> {
  if (!code || !codeVerifier) {
    console.error("❌ OAuth callback missing code or verifier");
    await updateSyncState({
      status: "error",
      phase: null,
      error: "OAuth callback missing authorization code",
    });
    return;
  }

  try {
    console.log("🔐 Exchanging OAuth code for tokens...");
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    setTokens(tokens);

    if (tokens.refresh_token) {
      await storeRefreshToken(tokens.refresh_token);
      console.log("💾 Refresh token stored in Keychain");
    }

    // Mark as authenticated immediately — this triggers the inbox view
    await updateSyncState({
      syncMode,
      status: "syncing",
      phase: "initial",
      lastSyncAt: Date.now(),
      error: null,
    });
    console.log(
      "✅ Authenticated — opening inbox, streaming messages in background",
    );

    // Start sync in the background — don't block the callback
    runInitialAndBackgroundSync(syncMode)
      .then(() => {
        if (syncMode === "all") {
          startDeferredFullSyncScheduler();
        } else {
          stopDeferredFullSyncScheduler();
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("❌ Background sync failed:", msg);
        updateSyncState({ status: "error", phase: null, error: msg });
      });

    // Start incremental polling
    stopPolling = await startIncrementalSyncPolling((message) => {
      emitNewMailToRenderer(message);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ OAuth callback error:", message);
    await updateSyncState({ status: "error", phase: null, error: message });
  }
}

async function init() {
  await createSchema();

  // Set up macOS application menu so Cmd+Q works
  ApplicationMenu.setApplicationMenu([
    {
      label: "Radius",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
        { type: "separator" },
        { role: "bringAllToFront" },
      ],
    },
  ]);

  // Clean up polling and sync schedulers before quitting
  Electrobun.events.on("before-quit", () => {
    stopPolling?.();
    stopDeferredFullSync?.();
    authServer?.stop();
  });

  const url = await getMainViewUrl();

  const rpc = BrowserView.defineRPC<RadiusRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        async getInbox({ limit, offset }: { limit: number; offset: number }) {
          const result = await getInboxMessages(limit, offset);
          return {
            messages:
              result.messages.map((message) =>
                normalizeMessageListRecord(message)
              ) as unknown as RadiusRPC["bun"]["requests"]["getInbox"]["response"]["messages"],
            total: result.total,
          };
        },

        async searchInbox({
          query,
          limit,
          offset,
        }: {
          query: string;
          limit: number;
          offset: number;
        }) {
          const result = await searchInboxMessages(query, limit, offset);
          return {
            messages:
              result.messages.map((message) =>
                normalizeMessageListRecord(message)
              ) as unknown as RadiusRPC["bun"]["requests"]["searchInbox"]["response"]["messages"],
            total: result.total,
          };
        },

        async getMessage({ id }: { id: string }) {
          let msg = await getMessageById(id);

          // On-demand body fetch only when we have no stored body at all.
          // This keeps the reader fast for already-synced mail while still
          // healing older cached messages that predate full body extraction.
          if (msg && msg.bodyHtml == null && msg.bodyText == null) {
            try {
              const accessToken = await getValidAccessToken();
              const gmailMsg = await getGmailMessage(accessToken, id);
              const bodies = await extractBodies(
                gmailMsg.payload,
                accessToken,
                id
              );

              if (bodies.html != null || bodies.text != null) {
                await updateMessageBodies(id, bodies.text, bodies.html);
                // Re-fetch so the returned shape matches exactly
                msg = await getMessageById(id);
              }
            } catch (err) {
              console.error(`Failed to fetch body for message ${id}:`, err);
              // Continue with the DB version (snippet fallback)
            }
          }

          return normalizeMessageRecord(
            msg
          ) as RadiusRPC["bun"]["requests"]["getMessage"]["response"];
        },

        async getSyncStatus() {
          const state = await getSyncState();
          return {
            status:
              state.status as RadiusRPC["bun"]["requests"]["getSyncStatus"]["response"]["status"],
            phase:
              (state.phase as "initial" | "background" | undefined) ??
              undefined,
            progress:
              state.progressCurrent !== null && state.progressTotal !== null
                ? { current: state.progressCurrent, total: state.progressTotal }
                : undefined,
            lastSyncAt: state.lastSyncAt ?? undefined,
            initialSyncCompletedAt: state.initialSyncCompletedAt ?? undefined,
            fullSyncCompletedAt: state.fullSyncCompletedAt ?? undefined,
            syncMode: state.syncMode === "all" ? "all" : "recent",
            fullSyncPending: state.backgroundSyncPending,
            error: state.error ?? undefined,
          };
        },

        async openExternalUrl({ url }: { url: string }) {
          try {
            const parsed = new URL(url);
            if (!["http:", "https:", "mailto:", "tel:", "x-apple.systempreferences:"].includes(parsed.protocol)) {
              return { success: false, error: `Unsupported protocol: ${parsed.protocol}` };
            }

            spawn("open", [parsed.toString()]);
            return { success: true };
          } catch (err) {
            console.error("openExternalUrl error:", err);
            return { success: false, error: String(err) };
          }
        },

        async startOAuth({ syncMode }: { syncMode: SyncMode }) {
          try {
            codeVerifier = generateCodeVerifier();
            const codeChallenge = await sha256(codeVerifier);
            const authURL = buildAuthURL(codeChallenge);

            // Start local redirect server
            authServer = Bun.serve({
              port: 3333,
              async fetch(req) {
                const url = new URL(req.url);
                if (url.pathname === "/" || url.pathname === "/oauth/callback") {
                  const code = url.searchParams.get("code");
                  if (code) {
                    handleOAuthCallback(code, syncMode).catch((err) => {
                      console.error("OAuth callback failed:", err);
                    });

                    authServer?.stop();
                    authServer = null;

                    return new Response(
                      "<html><body style='font-family: system-ui; text-align: center; padding-top: 40px;'><h2>✅ Authentication successful</h2><p>You can close this window and return to Radius.</p></body></html>",
                      { status: 200, headers: { "Content-Type": "text/html" } },
                    );
                  }
                }
                return new Response("Not found", { status: 404 });
              },
            });

            spawn("open", [authURL]);
            console.log("🌐 Opened system browser for OAuth");

            return { success: true };
          } catch (err) {
            console.error("startOAuth error:", err);
            return { success: false, error: String(err) };
          }
        },

        async startSync({ syncMode }: { syncMode?: SyncMode }) {
          try {
            const resolvedSyncMode = syncMode ?? "recent";
            runInitialAndBackgroundSync(resolvedSyncMode)
              .then(() => {
                if (resolvedSyncMode === "all") {
                  startDeferredFullSyncScheduler();
                } else {
                  stopDeferredFullSyncScheduler();
                }
              })
              .catch((err) => {
                console.error("Sync failed:", err);
              });
            return { success: true };
          } catch (err) {
            console.error("startSync error:", err);
            return { success: false, error: String(err) };
          }
        },

        async markMessageRead({ id }: { id: string }) {
          try {
            const message = await getMessageById(id);
            if (!message) {
              return { success: false, error: `Message not found: ${id}` };
            }

            if (Boolean(message.isRead)) {
              return { success: true, localStateApplied: true };
            }

            await setMessageReadState(id, true);
            const accessToken = await getValidAccessToken();
            await modifyMessageLabels(accessToken, id, {
              removeLabelIds: ["UNREAD"],
            });
            return { success: true, localStateApplied: true };
          } catch (err) {
            console.error("markMessageRead error:", err);
            if (
              err instanceof GmailAPIError &&
              err.status === 403 &&
              err.body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
            ) {
              return {
                success: false,
                error:
                  "Gmail read sync needs fresh Gmail modify permission. Reconnect Gmail once to enable it.",
                code: "reauth_required",
                localStateApplied: true,
              };
            }

            return {
              success: false,
              error: String(err),
              code: "remote_sync_failed",
              localStateApplied: true,
            };
          }
        },

        async requestNotificationPermission() {
          try {
            Utils.showNotification({
              title: "Radius notifications enabled",
              subtitle: "New mail alerts",
              body: "Radius will let you know when new email arrives while the app is open.",
              silent: false,
            });
            return { success: true };
          } catch (err) {
            console.error("requestNotificationPermission error:", err);
            return { success: false, error: String(err) };
          }
        },

        async openNotificationSettings() {
          try {
            spawn("open", [
              "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
            ]);
            return { success: true };
          } catch (err) {
            console.error("openNotificationSettings error:", err);
            return { success: false, error: String(err) };
          }
        },

        async checkForUpdate() {
          try {
            const updateInfo = await withUpdaterLock(() =>
              Updater.checkForUpdate()
            );
            rpc.send.updateStatus(updateInfo);
            return updateInfo;
          } catch (err) {
            console.error("checkForUpdate error:", err);
            return {
              version: "",
              hash: "",
              updateAvailable: false,
              updateReady: false,
              error: String(err),
            };
          }
        },

        async downloadUpdate() {
          try {
            await withUpdaterLock(() => Updater.downloadUpdate());
            const info = Updater.updateInfo();
            if (info) rpc.send.updateStatus(info);
            return { success: true };
          } catch (err) {
            console.error("downloadUpdate error:", err);
            return { success: false, error: String(err) };
          }
        },

        async applyUpdate() {
          try {
            const info = Updater.updateInfo();
            if (!info?.updateReady) {
              return { success: false, error: "No update ready to apply" };
            }
            await withUpdaterLock(() => Updater.applyUpdate());
            // App quits and relaunches — this line won't be reached
            return { success: true };
          } catch (err) {
            console.error("applyUpdate error:", err);
            return { success: false, error: String(err) };
          }
        },

        async getLocalReleaseInfo() {
          try {
            const [version, hash, baseUrl, channel] = await Promise.all([
              Updater.localInfo.version(),
              Updater.localInfo.hash(),
              Updater.localInfo.baseUrl(),
              Updater.localInfo.channel(),
            ]);
            return { version, hash, baseUrl, channel };
          } catch (err) {
            console.error("getLocalReleaseInfo error:", err);
            return {
              version: "",
              hash: "",
              baseUrl: "",
              channel: "",
            };
          }
        },
      },
      messages: {},
    },
  });

  emitNewMailToRenderer = (message) => {
    const rpcMessage = toRpcMessage(message);
    showNewMailNotification(rpcMessage);
    rpc.send.newMail(rpcMessage);
  };

  // ── Auto-update check on startup (non-dev builds only) ──
  async function checkForUpdates(): Promise<void> {
    try {
      const [baseUrl, channel] = await Promise.all([
        Updater.localInfo.baseUrl(),
        Updater.localInfo.channel(),
      ]);

      if (!baseUrl) {
        console.log("📦 Update baseUrl not configured — skipping update check");
        return;
      }

      if (channel === "dev") {
        console.log("📦 Dev build — skipping update check");
        return;
      }

      console.log(`📦 Checking for updates on ${channel}...`);
      const updateInfo = await withUpdaterLock(() =>
        Updater.checkForUpdate()
      );

      rpc.send.updateStatus(updateInfo);

      if (updateInfo.updateAvailable && !updateInfo.updateReady) {
        console.log(`⬇️  Update available: v${updateInfo.version} — downloading...`);
        await withUpdaterLock(() => Updater.downloadUpdate());

        const postDownload = Updater.updateInfo();
        if (postDownload) {
          rpc.send.updateStatus(postDownload);
          if (postDownload.updateReady) {
            console.log("✅ Update downloaded and ready to install");
          } else if (postDownload.error) {
            console.error("❌ Update download failed:", postDownload.error);
          }
        }
      } else if (updateInfo.updateReady) {
        console.log("✅ Update already downloaded and ready to install");
      } else if (updateInfo.error) {
        console.error("❌ Update check returned error:", updateInfo.error);
      } else {
        console.log("📦 App is up to date");
      }
    } catch (err) {
      console.error("❌ Update check failed:", err);
    }
  }

  const mainWindow = new BrowserWindow<typeof rpc>({
    title: "Radius",
    url,
    frame: { width: 1300, height: 800, x: 100, y: 70 },
    titleBarStyle: "hiddenInset",
    renderer: "cef",
    rpc,
  });

  void mainWindow;

  // Check for updates shortly after startup so the UI is ready
  setTimeout(() => {
    void checkForUpdates();
  }, 3000);

  const state = await getSyncState();

  if (state.initialSyncCompletedAt) {
    try {
      await runMessageMetadataBackfillIfNeeded();
    } catch (err) {
      console.error("❌ Metadata backfill failed:", err);
    }

    // User has synced before — catch up immediately then poll
    doIncrementalSync()
      .then((result) => {
        if (result.newMessages > 0) {
          console.log(
            `📥 Startup catch-up: ${result.newMessages} new message(s)`,
          );
        } else {
          console.log("📥 Startup catch-up: no new messages");
        }
      })
      .catch((err) => {
        console.error("❌ Startup catch-up failed:", err);
      });

    stopPolling = await startIncrementalSyncPolling((message) => {
      emitNewMailToRenderer(message);
    });

    if (state.syncMode === "all" && state.backgroundSyncPending) {
      startDeferredFullSyncScheduler();
    }
  } else {
    // No initial sync on record — check if user is authenticated but
    // initial sync never completed (crash, quit mid-sync, etc.)
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      console.log(
        "🔄 Authenticated but no initial sync found — resuming initial sync",
      );
      const resumedSyncMode = state.syncMode === "all" ? "all" : "recent";
      runInitialAndBackgroundSync(resumedSyncMode)
        .then(() => {
          if (resumedSyncMode === "all") {
            startDeferredFullSyncScheduler();
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("❌ Resume sync failed:", msg);
          updateSyncState({ status: "error", phase: null, error: msg });
        });
    }
  }

  // Keep reference for future cleanup (logout, quit, etc.)
  void stopPolling;
  void stopDeferredFullSync;

  console.log("🚀 Radius App Started");
}

init().catch((err) => {
  console.error("Failed to start Radius:", err);
  process.exit(1);
});
