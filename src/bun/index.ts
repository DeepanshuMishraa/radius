import { BrowserWindow, BrowserView } from "electrobun/bun";
import { spawn } from "node:child_process";
import type { RadiusRPC } from "../shared/types";
import {
  createSchema,
  getInboxMessages,
  getMessageById,
  getSyncState,
  searchInboxMessages,
  updateSyncState,
  updateMessageBodies,
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
} from "./gmail";
import {
  runInitialAndBackgroundSync,
  startIncrementalSyncPolling,
  doIncrementalSync,
} from "./sync";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await import("electrobun/bun").then((m) =>
    m.Updater.localInfo.channel(),
  );
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

async function handleOAuthCallback(code: string): Promise<void> {
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
      status: "syncing",
      phase: "initial",
      lastSyncAt: Date.now(),
      error: null,
    });
    console.log(
      "✅ Authenticated — opening inbox, streaming messages in background",
    );

    // Start sync in the background — don't block the callback
    runInitialAndBackgroundSync().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ Background sync failed:", msg);
      updateSyncState({ status: "error", phase: null, error: msg });
    });

    // Start incremental polling
    stopPolling = await startIncrementalSyncPolling();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ OAuth callback error:", message);
    await updateSyncState({ status: "error", phase: null, error: message });
  }
}

async function init() {
  await createSchema();

  const url = await getMainViewUrl();

  const rpc = BrowserView.defineRPC<RadiusRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        async getInbox({ limit, offset }: { limit: number; offset: number }) {
          const result = await getInboxMessages(limit, offset);
          return {
            messages:
              result.messages as unknown as RadiusRPC["bun"]["requests"]["getInbox"]["response"]["messages"],
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
              result.messages as unknown as RadiusRPC["bun"]["requests"]["searchInbox"]["response"]["messages"],
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

          return msg as unknown as RadiusRPC["bun"]["requests"]["getMessage"]["response"];
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
            fullSyncCompletedAt: state.fullSyncCompletedAt ?? undefined,
            error: state.error ?? undefined,
          };
        },

        async openExternalUrl({ url }: { url: string }) {
          try {
            const parsed = new URL(url);
            if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
              return { success: false, error: `Unsupported protocol: ${parsed.protocol}` };
            }

            spawn("open", [parsed.toString()]);
            return { success: true };
          } catch (err) {
            console.error("openExternalUrl error:", err);
            return { success: false, error: String(err) };
          }
        },

        async startOAuth() {
          try {
            codeVerifier = generateCodeVerifier();
            const codeChallenge = await sha256(codeVerifier);
            const authURL = buildAuthURL(codeChallenge);

            // Start local redirect server
            authServer = Bun.serve({
              port: 3333,
              async fetch(req) {
                const url = new URL(req.url);
                if (url.pathname === "/oauth/callback") {
                  const code = url.searchParams.get("code");
                  if (code) {
                    handleOAuthCallback(code).catch((err) => {
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

        async startSync() {
          try {
            runInitialAndBackgroundSync().catch((err) => {
              console.error("Sync failed:", err);
            });
            return { success: true };
          } catch (err) {
            console.error("startSync error:", err);
            return { success: false, error: String(err) };
          }
        },
      },
      messages: {},
    },
  });

  const mainWindow = new BrowserWindow<typeof rpc>({
    title: "Radius",
    url,
    frame: { width: 1300, height: 800, x: 100, y: 70 },
    titleBarStyle: "hiddenInset",
    renderer: "cef",
    rpc,
  });

  void mainWindow;

  const state = await getSyncState();

  if (state.fullSyncCompletedAt) {
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

    stopPolling = await startIncrementalSyncPolling();
  } else {
    // No full sync on record — check if user is authenticated but
    // initial sync never completed (crash, quit mid-sync, etc.)
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      console.log(
        "🔄 Authenticated but no full sync found — resuming initial sync",
      );
      runInitialAndBackgroundSync().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("❌ Resume sync failed:", msg);
        updateSyncState({ status: "error", phase: null, error: msg });
      });
    }
  }

  // Keep reference for future cleanup (logout, quit, etc.)
  void stopPolling;

  console.log("🚀 Radius App Started");
}

init().catch((err) => {
  console.error("Failed to start Radius:", err);
  process.exit(1);
});
