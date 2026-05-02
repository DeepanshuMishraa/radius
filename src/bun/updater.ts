import { Updater } from "electrobun/bun";
import type { RadiusRPC } from "../shared/types";

// ── Updater serialization guard ──
// Electrobun's Updater is process-global; only one operation at a time.
let updaterLock: Promise<unknown> = Promise.resolve();

function withUpdaterLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = updaterLock.then(() => fn()).catch(() => fn());
  updaterLock = next;
  return next as Promise<T>;
}

export async function handleCheckForUpdate(
  rpc: { send: { updateStatus(info: RadiusRPC["webview"]["messages"]["updateStatus"]): void } },
) {
  try {
    const updateInfo = await withUpdaterLock(() =>
      Updater.checkForUpdate(),
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
}

export async function handleDownloadUpdate(
  rpc: { send: { updateStatus(info: RadiusRPC["webview"]["messages"]["updateStatus"]): void } },
) {
  try {
    await withUpdaterLock(() => Updater.downloadUpdate());
    const info = Updater.updateInfo();
    if (info) rpc.send.updateStatus(info);
    return { success: true };
  } catch (err) {
    console.error("downloadUpdate error:", err);
    return { success: false, error: String(err) };
  }
}

export async function handleApplyUpdate() {
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
}

export async function handleGetLocalReleaseInfo() {
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
}

// ── Startup auto-update check ──

export async function checkForUpdates(
  rpc: { send: { updateStatus(info: RadiusRPC["webview"]["messages"]["updateStatus"]): void } },
): Promise<void> {
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
    const updateInfo = await withUpdaterLock(() => Updater.checkForUpdate());

    rpc.send.updateStatus(updateInfo);

    if (updateInfo.updateAvailable && !updateInfo.updateReady) {
      console.log(
        `⬇️  Update available: v${updateInfo.version} — downloading...`,
      );
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