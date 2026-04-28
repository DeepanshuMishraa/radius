import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import type { RadiusRPC } from "../shared/types";
import { createSchema, getInboxMessages, getMessageById, getSyncState } from "./db";
import {
  buildAuthURL,
  exchangeCodeForTokens,
  storeRefreshToken,
  generateCodeVerifier,
  sha256,
  setTokens,
} from "./auth";
import { doFullSync, startIncrementalSyncPolling } from "./sync";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await import("electrobun/bun").then((m) => m.Updater.localInfo.channel());
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support."
      );
    }
  }
  return "views://mainview/index.html";
}

// PKCE state
let codeVerifier: string | null = null;
let oauthWindow: BrowserWindow | null = null;
let stopPolling: (() => void) | null = null;

async function handleOAuthCallback(url: string): Promise<void> {
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code");

  if (!code || !codeVerifier) {
    console.error("OAuth callback missing code or verifier");
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    setTokens(tokens);
    if (tokens.refresh_token) {
      await storeRefreshToken(tokens.refresh_token);
    }

    // Close OAuth window
    oauthWindow?.close();
    oauthWindow = null;

    // Start sync
    await doFullSync();

    // Start incremental polling
    stopPolling = await startIncrementalSyncPolling();

    console.log("OAuth complete — sync started");
  } catch (err) {
    console.error("OAuth callback error:", err);
  }
}

async function init() {
  await createSchema();

  const url = await getMainViewUrl();

  // Listen for deeplink OAuth callbacks
  Electrobun.events.on("open-url", (e: { data?: { url?: string } }) => {
    const url = e.data?.url as string | undefined;
    if (url?.startsWith("radius://oauth/callback")) {
      handleOAuthCallback(url);
    }
  });

  // Define typed RPC handlers
  const rpc = BrowserView.defineRPC<RadiusRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        async getInbox({ limit, offset }: { limit: number; offset: number }) {
          const result = await getInboxMessages(limit, offset);
          return {
            messages: result.messages as unknown as RadiusRPC["bun"]["requests"]["getInbox"]["response"]["messages"],
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
            status: state.status as RadiusRPC["bun"]["requests"]["getSyncStatus"]["response"]["status"],
            lastSyncAt: state.lastSyncAt ?? undefined,
          };
        },

        async startOAuth() {
          try {
            codeVerifier = generateCodeVerifier();
            const codeChallenge = await sha256(codeVerifier);
            const authURL = buildAuthURL(codeChallenge);

            // Open OAuth window
            oauthWindow = new BrowserWindow({
              title: "Connect Gmail",
              url: authURL,
              frame: { width: 480, height: 600, x: 0, y: 0 },
            });

            return { success: true };
          } catch (err) {
            console.error("startOAuth error:", err);
            return { success: false, error: String(err) };
          }
        },

        async startSync() {
          try {
            await doFullSync();

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
    titleBarStyle: "default",
    renderer: "cef",
    rpc,
  });

  // Silence unused warning — we keep the reference for future message sending
  void mainWindow;

  // Check if already authenticated
  const state = await getSyncState();
  if (state.fullSyncCompletedAt) {
    stopPolling = await startIncrementalSyncPolling();
  }

  console.log("Radius App Started");
}

init().catch((err) => {
  console.error("Failed to start Radius:", err);
  process.exit(1);
});
