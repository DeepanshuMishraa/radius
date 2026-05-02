import Electrobun, {
  BrowserView,
  BrowserWindow,
  ApplicationMenu,
  Screen,
  Updater,
} from "electrobun/bun";
import type { RadiusRPC } from "../shared/types";
import { createSchema, getSyncState } from "./db";
import { getMainViewUrl } from "./url";
import { toRpcMessage } from "./rpc-handlers";
import {
  handleGetInbox,
  handleSearchInbox,
  handleGetMessage,
  handleGetSyncStatus,
  handleMarkMessageRead,
} from "./rpc-handlers";
import {
  handleOpenExternalUrl,
  handleRequestNotificationPermission,
  handleOpenNotificationSettings,
  showNewMailNotification,
} from "./ui";
import {
  handleStartOAuth,
  handleStartSync,
  startExistingUserSync,
  tryResumeSyncFromRefreshToken,
  getStopPolling,
  getStopDeferredFullSync,
  getAuthServer,
  setEmitNewMailToRenderer,
} from "./sync-lifecycle";
import {
  handleApplyUpdate,
  handleGetLocalReleaseInfo,
  checkForUpdates,
} from "./updater";

let mainWindow: BrowserWindow<any> | null = null;

async function createMainWindow() {
  const url = await getMainViewUrl();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc: any = BrowserView.defineRPC<RadiusRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        getInbox: handleGetInbox,
        searchInbox: handleSearchInbox,
        getMessage: handleGetMessage,
        getSyncStatus: handleGetSyncStatus,
        openExternalUrl: handleOpenExternalUrl,
        startOAuth: handleStartOAuth,
        startSync: handleStartSync,
        markMessageRead: handleMarkMessageRead,
        requestNotificationPermission: handleRequestNotificationPermission,
        openNotificationSettings: handleOpenNotificationSettings,
        applyUpdate: handleApplyUpdate,
        getLocalReleaseInfo: handleGetLocalReleaseInfo,

        // Update handlers need rpc to send status — kept inline to avoid circular type
        async checkForUpdate() {
          const { handleCheckForUpdate } = await import("./updater");
          return handleCheckForUpdate(rpc);
        },
        async downloadUpdate() {
          const { handleDownloadUpdate } = await import("./updater");
          return handleDownloadUpdate(rpc);
        },
      },
      messages: {},
    },
  });

  setEmitNewMailToRenderer((message) => {
    const rpcMessage = toRpcMessage(message);
    showNewMailNotification(rpcMessage);
    rpc.send.newMail(rpcMessage);
  });

  const { x, y, width, height } = Screen.getPrimaryDisplay().workArea;

  mainWindow = new BrowserWindow<typeof rpc>({
    title: "Radius",
    url,
    frame: { x, y, width, height },
    titleBarStyle: "hiddenInset",
    rpc,
  });

  // Disable right-click context menu in release builds
  const channel = await Updater.localInfo.channel();
  if (channel !== "dev") {
    const webviewId = mainWindow.webviewId;
    Electrobun.events.on(`dom-ready-${webviewId}`, () => {
      mainWindow?.webview.executeJavascript(
        `document.addEventListener("contextmenu",(e)=>e.preventDefault())`,
      );
    });
  }

  // Check for updates shortly after the window is created
  setTimeout(() => {
    void checkForUpdates(rpc);
  }, 3000);
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
    getStopPolling()?.();
    getStopDeferredFullSync()?.();
    getAuthServer()?.stop();
  });

  // ── macOS-native window lifecycle ──
  // Closing the window destroys it (Electrobun doesn't support intercepting close).
  // exitOnLastWindowClosed is false, so the app stays running.
  // When the user clicks the dock icon, we recreate the window.

  Electrobun.events.on("reopen", () => {
    if (!mainWindow || !BrowserWindow.getById(mainWindow.id)) {
      createMainWindow().catch((err) => {
        console.error("Failed to recreate window on reopen:", err);
      });
    } else {
      mainWindow.unminimize();
      mainWindow.focus();
    }
  });

  await createMainWindow();

  const state = await getSyncState();

  if (state.initialSyncCompletedAt) {
    await startExistingUserSync();
  } else {
    await tryResumeSyncFromRefreshToken();
  }

  console.log("🚀 Radius App Started");
}

init().catch((err) => {
  console.error("Failed to start Radius:", err);
  process.exit(1);
});