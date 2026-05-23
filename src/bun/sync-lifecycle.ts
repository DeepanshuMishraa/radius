import { spawn } from "node:child_process";
import type { SyncMode, ImapSettings } from "../shared/types";
import {
  updateSyncState,
  getSyncState,
  switchAccount as switchDbAccount,
  deleteAccountDb,
  clearMessages,
  resetSyncState,
  clearImapFolderSync,
} from "./db";
import {
  buildAuthURL,
  exchangeCodeForTokens,
  generateCodeVerifier,
  sha256,
  setTokens,
  storeRefreshToken,
  getRefreshToken,
  getRefreshTokenForActiveAccount,
  getValidAccessToken,
  getProfile,
  setAccountEmail,
  deleteRefreshToken,
  deleteImapPassword,
} from "./auth";
import {
  runInitialAndBackgroundSync,
  continueDeferredFullSyncIfDue,
  startIncrementalSyncPolling,
  doIncrementalSync,
  runMessageMetadataBackfillIfNeeded,
  cancelSync,
  isSyncLocked,
} from "./sync";
import {
  getAccounts,
  getActiveAccount,
  setActiveAccount,
  addAccount,
  removeAccount,
  getAccount,
} from "./accounts";
import { registerProvider, removeProvider } from "./provider";

let codeVerifier: string | null = null;
let authServer: ReturnType<typeof Bun.serve> | null = null;
let isAuthInProgress = false;
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
  cancelSync();
}

function waitForSyncLockRelease(maxWaitMs = 10000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!isSyncLocked()) {
        resolve();
        return;
      }
      if (Date.now() - start > maxWaitMs) {
        console.warn("⏱ Sync lock wait timed out — proceeding with account switch anyway");
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function startSyncForAccount() {
  const account = await getActiveAccount();
  if (!account) return;

  const accountInfo = await getAccount(account);
  if (accountInfo?.provider === "imap") {
    await runInitialAndBackgroundSync("recent")
      .then(() => {
        console.log("📥 IMAP sync complete");
      })
      .catch((err) => {
        console.error("❌ IMAP initial sync failed:", err);
      });

    stopPolling = await startIncrementalSyncPolling();
    return;
  }

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
    const refreshToken = await getRefreshTokenForActiveAccount();
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
  options: { startSync: boolean } = { startSync: true },
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

    await addAccount({ email, name: email.split("@")[0], addedAt: Date.now(), provider: "gmail" });
    await setActiveAccount(email);
    await switchDbAccount(email);
    setAccountEmail(email);

    if (!options.startSync) {
      await updateSyncState({
        error: null,
        lastSyncAt: Date.now(),
      });
      console.log(`✅ Reconnected ${email} without resyncing local mail`);
      return;
    }

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

export async function handleStartOAuth(params: { syncMode: SyncMode; email?: string }) {
  const { syncMode, email } = params;
  if (isAuthInProgress) {
    console.warn("OAuth already in progress, skipping duplicate trigger");
    return { success: false, error: "Authentication already in progress." };
  }
  try {
    isAuthInProgress = true;
    codeVerifier = generateCodeVerifier();
    const codeChallenge = await sha256(codeVerifier);
    const authURL = buildAuthURL(codeChallenge, email);

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
            try {
              await handleOAuthCallback(code, syncMode, { startSync: true });
            } catch (err) {
              console.error("OAuth callback failed:", err);
            }

            isAuthInProgress = false;
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

export async function handleReconnectAccount(params: { email?: string }) {
  if (isAuthInProgress) {
    console.warn("OAuth already in progress, skipping duplicate reconnect");
    return { success: false, error: "Authentication already in progress." };
  }
  const targetEmail = params.email ?? (await getActiveAccount()) ?? undefined;
  if (!targetEmail) {
    return { success: false, error: "No active account to reconnect." };
  }
  try {
    isAuthInProgress = true;
    codeVerifier = generateCodeVerifier();
    const codeChallenge = await sha256(codeVerifier);
    const authURL = buildAuthURL(codeChallenge, targetEmail);

    authServer = Bun.serve({
      port: 3333,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/" || url.pathname === "/oauth/callback") {
          const code = url.searchParams.get("code");
          if (code) {
            try {
              await handleOAuthCallback(code, "recent", { startSync: false });
              
              const activeEmail = await getActiveAccount();
              const normalizedTarget = targetEmail.toLowerCase().trim();
              const normalizedActive = (activeEmail ?? "").toLowerCase().trim();
              if (normalizedActive !== normalizedTarget) {
                console.warn(
                  `Reconnect email mismatch: target=${targetEmail}, got=${activeEmail} — restoring original active account`
                );
                await setActiveAccount(targetEmail);
                await switchDbAccount(targetEmail);
                setAccountEmail(targetEmail);
                isAuthInProgress = false;
                authServer?.stop();
                authServer = null;
                return new Response(
                  "<html><body style='font-family: system-ui; text-align: center; padding-top: 40px;'><h2>❌ Account mismatch</h2><p>Reconnected as " + (activeEmail ?? "unknown") + " instead of " + targetEmail + ". Please try again with the correct account.</p></body></html>",
                  { status: 400, headers: { "Content-Type": "text/html" } },
                );
              }
            } catch (err) {
              console.error("Reconnect callback failed:", err);
            }

            isAuthInProgress = false;
            authServer?.stop();
            authServer = null;

            return new Response(
              "<html><body style='font-family: system-ui; text-align: center; padding-top: 40px;'><h2>✅ Reconnected successfully</h2><p>You can close this window and return to Radius.</p></body></html>",
              { status: 200, headers: { "Content-Type": "text/html" } },
            );
          }
        }
        return new Response("Not found", { status: 404 });
      },
    });

    spawn("open", [authURL]);
    console.log(`🌐 Opened system browser to reconnect ${targetEmail}`);
    return { success: true };
  } catch (err) {
    console.error("reconnectAccount error:", err);
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
          provider: "gmail" as const,
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
    await waitForSyncLockRelease();

    await setActiveAccount(email);
    await switchDbAccount(email);
    setAccountEmail(email);

    if (email) {
      const account = await getAccount(email);
      if (account?.provider === "imap") {
        const { ImapProvider } = await import("./imap-provider");
        const provider = new ImapProvider(email);
        registerProvider(email, provider);
        await startSyncForAccount();
      } else {
        const refreshToken = await getRefreshToken(email);
        if (refreshToken) {
          await startSyncForAccount();
        }
      }
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Switch account failed:", message);
    return { success: false, error: message };
  }
}

export async function handleRemoveAccount(params: { email: string }) {
  const { email } = params;
  try {
    stopAllSync();
    await waitForSyncLockRelease();

    const account = await getAccount(email);
    if (account?.provider === "imap") {
      await deleteImapPassword(email);
    } else {
      await deleteRefreshToken(email);
    }

    await removeAccount(email);
    removeProvider(email);

    const remaining = await getAccounts();
    if (remaining.length === 0 && account?.provider !== "imap") {
      await deleteRefreshToken();
    }

    const active = await getActiveAccount();
    await switchDbAccount(active);
    await deleteAccountDb(email);
    setAccountEmail(active);

    if (active) {
      await startSyncForAccount();
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Remove account failed:", message);
    return { success: false, error: message };
  }
}

export async function handleAddImapAccount(params: {
  email: string;
  password: string;
  imapSettings: ImapSettings;
}) {
  try {
    const { ImapProvider } = await import("./imap-provider");
    const provider = new ImapProvider(params.email);

    const testResult = await provider.testConnection(params.password, params.imapSettings);
    if (!testResult.success) {
      return { success: false, error: testResult.error ?? "IMAP connection failed" };
    }

    await provider.setPassword(params.password, params.imapSettings);
    registerProvider(params.email, provider);

    const name = params.email.split("@")[0];
    await addAccount({
      email: params.email,
      name,
      addedAt: Date.now(),
      provider: "imap",
      imapSettings: params.imapSettings,
    });
    await setActiveAccount(params.email);
    await switchDbAccount(params.email);
    setAccountEmail(params.email);

    await updateSyncState({
      syncMode: "recent",
      status: "syncing",
      phase: "initial",
      lastSyncAt: Date.now(),
      error: null,
    });

    runInitialAndBackgroundSync("recent")
      .then(() => {
        console.log(`✅ IMAP sync complete for ${params.email}`);
      })
      .catch((err) => {
        console.error("❌ IMAP sync failed:", err);
      });

    stopPolling = await startIncrementalSyncPolling();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Add IMAP account failed:", message);
    return { success: false, error: message };
  }
}

export async function handleTestImapConnection(params: {
  email: string;
  password: string;
  imapSettings: ImapSettings;
}) {
  try {
    const { testConnection } = await import("./imap");
    return testConnection({
      host: params.imapSettings.host,
      port: params.imapSettings.port,
      useTls: params.imapSettings.useTls,
      email: params.email,
      password: params.password,
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function startExistingUserSync() {
  const active = await getActiveAccount();
  if (active) {
    await switchDbAccount(active);
    setAccountEmail(active);
  }

  const account = active ? await getAccount(active) : null;
  if (account?.provider === "imap") {
    const { ImapProvider } = await import("./imap-provider");
    const provider = new ImapProvider(active!);
    registerProvider(active!, provider);

    runInitialAndBackgroundSync("recent")
      .then(() => {
        console.log("📥 IMAP sync complete");
      })
      .catch((err) => {
        console.error("❌ IMAP initial sync failed:", err);
      });

    stopPolling = await startIncrementalSyncPolling();
    return;
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
    const refreshToken = await getRefreshTokenForActiveAccount();
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

export async function handleResyncAccount() {
  try {
    stopAllSync();
    await waitForSyncLockRelease();

    const { getAccountEmail } = await import("./auth");
    const email = getAccountEmail();
    const account = email ? await getAccount(email) : null;

    if (account?.provider === "imap") {
      await clearMessages();
      await resetSyncState();
      await clearImapFolderSync();

      runInitialAndBackgroundSync("recent")
        .then(() => {
          console.log("📥 IMAP resync complete");
        })
        .catch((err) => {
          console.error("❌ IMAP resync failed:", err);
        });

      stopPolling = await startIncrementalSyncPolling();
      return { success: true };
    }

    const refreshToken = await getRefreshTokenForActiveAccount();
    if (!refreshToken) {
      return { success: false, error: "No refresh token found — please authenticate first" };
    }

    await clearMessages();
    await resetSyncState();

    await updateSyncState({
      syncMode: "recent",
      status: "syncing",
      phase: "initial",
      lastSyncAt: Date.now(),
      error: null,
    });

    const resumedSyncMode = "recent";
    runInitialAndBackgroundSync(resumedSyncMode)
      .then(() => {
        stopDeferredFullSyncScheduler();
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("❌ Resync failed:", msg);
        updateSyncState({ status: "error", phase: null, error: msg });
      });

    stopPolling = await startIncrementalSyncPolling((message) => {
      emitNewMailToRenderer(message);
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Resync account failed:", message);
    return { success: false, error: message };
  }
}

export async function tryResumeSyncFromRefreshToken() {
  const active = await getActiveAccount();
  if (active) {
    await switchDbAccount(active);
    setAccountEmail(active);
  }

  const account = active ? await getAccount(active) : null;
  if (account?.provider === "imap") {
    return;
  }

  const state = await getSyncState();
  const refreshToken = await getRefreshTokenForActiveAccount();
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
