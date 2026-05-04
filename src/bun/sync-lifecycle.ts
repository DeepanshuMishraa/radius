import { spawn } from "node:child_process";
import type { SyncMode } from "../shared/types";
import {
  updateSyncState,
  getSyncState,
  switchAccount as switchDbAccount,
} from "./db";
import {
  buildAuthURL,
  exchangeCodeForTokens,
  generateCodeVerifier,
  sha256,
  setTokens,
  storeRefreshToken,
  getRefreshToken,
  getValidAccessToken,
  getProfile,
  setAccountEmail,
} from "./auth";
import {
  runInitialAndBackgroundSync,
  continueDeferredFullSyncIfDue,
  startIncrementalSyncPolling,
  doIncrementalSync,
  runMessageMetadataBackfillIfNeeded,
} from "./sync";
import {
  getAccounts,
  getActiveAccount,
  setActiveAccount,
  addAccount,
} from "./accounts";

let codeVerifier: string | null = null;
let authServer: ReturnType<typeof Bun.serve> | null = null;
let stopPolling: (() => void) | null = null;
let stopDeferredFullSync: (() => void) | null = null;
let emitNewMailToRenderer: (
  message: Awaited<ReturnType<typeof import("./gmail").getMessage>>,
) => void = () => {};

export function getStopPolling() {
  return stopPolling;
}

export function getStopDeferredFullSync() {
  return stopDeferredFullSync;
}

export function getAuthServer() {
  return authServer;
}

export function setEmitNewMailToRenderer(
  fn: (message: Awaited<ReturnType<typeof import("./gmail").getMessage>>) => void,
) {
  emitNewMailToRenderer = fn;
}

// ── Deferred full sync scheduler ──

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

function stopAllSync() {
  stopPolling?.();
  stopPolling = null;
  stopDeferredFullSyncScheduler();
}

async function startSyncForAccount() {
  const state = await getSyncState();

  if (state.initialSyncCompletedAt) {
    await runMessageMetadataBackfillIfNeeded().catch((err) => {
      console.error("❌ Metadata backfill failed:", err);
    });

    doIncrementalSync()
      .then((result) => {
        if (result.newMessages > 0) {
          console.log(`📥 Startup catch-up: ${result.newMessages} new message(s)`);
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
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      console.log("🔄 Authenticated but no initial sync found — resuming initial sync");
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

      stopPolling = await startIncrementalSyncPolling((message) => {
        emitNewMailToRenderer(message);
      });
    }
  }
}

// ── OAuth callback ──

async function handleOAuthCallback(
  code: string,
  syncMode: SyncMode,
): Promise<void> {
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

    console.log("👤 Fetching Gmail profile...");
    const profile = await getProfile(tokens.access_token);
    const email = profile.emailAddress;

    if (tokens.refresh_token) {
      await storeRefreshToken(tokens.refresh_token, email);
      console.log(`💾 Refresh token stored in Keychain for ${email}`);
    }

    await addAccount({ email, name: email.split("@")[0], addedAt: Date.now() });
    await setActiveAccount(email);
    await switchDbAccount(email);
    setAccountEmail(email);

    await updateSyncState({
      syncMode,
      status: "syncing",
      phase: "initial",
      lastSyncAt: Date.now(),
      error: null,
    });
    console.log(
      `✅ Authenticated as ${email} — opening inbox, streaming messages in background`,
    );

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

    stopPolling = await startIncrementalSyncPolling((message) => {
      emitNewMailToRenderer(message);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ OAuth callback error:", message);
    await updateSyncState({ status: "error", phase: null, error: message });
  }
}

// ── Exposed RPC-style handlers ──

export async function handleStartOAuth(params: { syncMode: SyncMode }) {
  const { syncMode } = params;
  try {
    codeVerifier = generateCodeVerifier();
    const codeChallenge = await sha256(codeVerifier);
    const authURL = buildAuthURL(codeChallenge);

    authServer = Bun.serve({
      port: 3333,
      async fetch(req) {
        const url = new URL(req.url);
        if (
          url.pathname === "/" ||
          url.pathname === "/oauth/callback"
        ) {
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
}

export async function handleStartSync(params: { syncMode?: SyncMode }) {
  const { syncMode } = params;
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
}

export async function handleGetAccounts() {
  let accounts = await getAccounts();
  let active = await getActiveAccount();

  if (accounts.length === 0) {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        const accessToken = await getValidAccessToken();
        const profile = await getProfile(accessToken);
        const account = {
          email: profile.emailAddress,
          name: profile.emailAddress.split("@")[0],
          addedAt: Date.now(),
        };
        await addAccount(account);
        if (!active) {
          await setActiveAccount(profile.emailAddress);
          active = profile.emailAddress;
        }
        accounts = await getAccounts();
      }
    } catch (err) {
      console.error("Failed to auto-populate accounts for existing user:", err);
    }
  }

  return { accounts, activeAccount: active };
}

export async function handleSwitchAccount(params: { email: string | null }) {
  const { email } = params;
  try {
    stopAllSync();

    await setActiveAccount(email);
    await switchDbAccount(email);
    setAccountEmail(email);

    if (email) {
      const refreshToken = await getRefreshToken(email);
      if (refreshToken) {
        await startSyncForAccount();
      }
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Switch account failed:", message);
    return { success: false, error: message };
  }
}

export async function startExistingUserSync() {
  const active = await getActiveAccount();
  if (active) {
    await switchDbAccount(active);
    setAccountEmail(active);
  }

  const state = await getSyncState();

  if (state.initialSyncCompletedAt) {
    await runMessageMetadataBackfillIfNeeded().catch((err) => {
      console.error("❌ Metadata backfill failed:", err);
    });

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

      stopPolling = await startIncrementalSyncPolling((message) => {
        emitNewMailToRenderer(message);
      });
    }
  }
}

export async function tryResumeSyncFromRefreshToken() {
  const active = await getActiveAccount();
  if (active) {
    await switchDbAccount(active);
    setAccountEmail(active);
  }

  const state = await getSyncState();
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
