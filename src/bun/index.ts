import { BrowserWindow, BrowserView } from "electrobun/bun";
import { spawn } from "node:child_process";
import type { RadiusRPC } from "../shared/types";
import {
  createSchema,
  getInboxMessages,
  getMessageById,
  getSyncState,
  updateSyncState,
} from "./db";
import {
  buildAuthURL,
  exchangeCodeForTokens,
  storeRefreshToken,
  generateCodeVerifier,
  sha256,
  setTokens,
} from "./auth";
import {
  runBackgroundCatchupSync,
  runInitialAndBackgroundSync,
  startIncrementalSyncPolling,
} from "./sync";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await import("electrobun/bun").then((m) =>
    m.Updater.localInfo.channel(),
  );
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
  }
  return "views://mainview/index.html";
}

// PKCE state
let codeVerifier: string | null = null;
let authServer: ReturnType<typeof Bun.serve> | null = null;
let stopPolling: (() => void) | null = null;

async function handleOAuthCallback(code: string): Promise<void> {
  if (!code || !codeVerifier) {
    console.error("OAuth callback missing code or verifier");
    await updateSyncState({
      status: "error",
      phase: null,
      error: "OAuth callback missing authorization code",
    });
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    setTokens(tokens);
    if (tokens.refresh_token) {
      await storeRefreshToken(tokens.refresh_token);
    }

    // Start the initial onboarding sync, then continue the remainder in background.
    await runInitialAndBackgroundSync();

    // Start incremental polling
    stopPolling = await startIncrementalSyncPolling();

    console.log("OAuth complete — sync started");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("OAuth callback error:", err);
    await updateSyncState({ status: "error", phase: null, error: message });
  }
}

async function init() {
  await createSchema();

  const url = await getMainViewUrl();

  // Define typed RPC handlers
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

        async getMessage({ id }: { id: string }) {
          const msg = await getMessageById(id);
          return msg as unknown as RadiusRPC["bun"]["requests"]["getMessage"]["response"];
        },

        async getSyncStatus() {
          const state = await getSyncState();
          return {
            status:
              state.status as RadiusRPC["bun"]["requests"]["getSyncStatus"]["response"]["status"],
            phase:
              (state.phase as RadiusRPC["bun"]["requests"]["getSyncStatus"]["response"]["phase"]) ??
              undefined,
            progress:
              state.progressCurrent !== null && state.progressTotal !== null
                ? {
                    current: state.progressCurrent,
                    total: state.progressTotal,
                  }
                : undefined,
            lastSyncAt: state.lastSyncAt ?? undefined,
            initialSyncCompletedAt: state.initialSyncCompletedAt ?? undefined,
            fullSyncCompletedAt: state.fullSyncCompletedAt ?? undefined,
            error: state.error ?? undefined,
          };
        },

        async startOAuth() {
          try {
            codeVerifier = generateCodeVerifier();
            const codeChallenge = await sha256(codeVerifier);
            const authURL = buildAuthURL(codeChallenge);

            await updateSyncState({
              status: "syncing",
              phase: "initial",
              progressCurrent: 0,
              progressTotal: 1000,
              error: null,
            });

            // Start local redirect server
            authServer = Bun.serve({
              port: 3333,
              async fetch(req) {
                const url = new URL(req.url);
                if (url.pathname === "/oauth/callback") {
                  const code = url.searchParams.get("code");
                  if (code) {
                    // Handle the OAuth callback — must catch so the promise doesn't float
                    handleOAuthCallback(code).catch((err) => {
                      console.error("OAuth callback failed:", err);
                    });

                    // Stop the server after receiving the callback
                    authServer?.stop();
                    authServer = null;

                    return new Response(
                      "<html><body style='font-family: system-ui; text-align: center; padding-top: 40px;'><h2>Authentication successful</h2><p>You can close this window and return to Radius.</p></body></html>",
                      {
                        status: 200,
                        headers: { "Content-Type": "text/html" },
                      },
                    );
                  }
                }
                return new Response("Not found", { status: 404 });
              },
            });

            // Open the user's default system browser
            spawn("open", [authURL]);

            return { success: true };
          } catch (err) {
            console.error("startOAuth error:", err);
            return { success: false, error: String(err) };
          }
        },

        async startSync() {
          try {
            await runInitialAndBackgroundSync();

            if (!stopPolling) {
              stopPolling = await startIncrementalSyncPolling();
            }

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
    frame: {
      width: 1300,
      height: 800,
      x: 200,
      y: 200,
    },
    titleBarStyle: "hiddenInset",
    renderer: "cef",
    rpc,
  });

  // Silence unused warning — we keep the reference for future message sending
  void mainWindow;

  // Check if already authenticated
  const state = await getSyncState();
  if (state.fullSyncCompletedAt) {
    stopPolling = await startIncrementalSyncPolling();
  } else if (state.initialSyncCompletedAt && !state.fullSyncCompletedAt) {
    void runBackgroundCatchupSync()
      .then(async () => {
        if (!stopPolling) {
          stopPolling = await startIncrementalSyncPolling();
        }
      })
      .catch((err) => {
        console.error("Failed to resume background sync:", err);
      });
  }

  console.log("Radius App Started");
}

init().catch((err) => {
  console.error("Failed to start Radius:", err);
  process.exit(1);
});
