// Shared RPC types for Electrobun's defineRPC
// Imported by both main process (Bun) and renderer (browser)

export type EmailCategory =
  | "important"
  | "promotional"
  | "social"
  | "updates"
  | "forums"
  | "spam"
  | "personal"
  | "regular";

export type SyncMode = "recent" | "all";

export interface UpdateInfo {
  version: string;
  hash: string;
  updateAvailable: boolean;
  updateReady: boolean;
  error?: string;
}

export interface LocalReleaseInfo {
  version: string;
  hash: string;
  baseUrl: string;
  channel: string;
}

export interface Message {
  id: string;
  threadId: string;
  historyId: string;
  internalDate: number;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  category: EmailCategory;
  isRead: boolean;
}

export interface SyncStatus {
  status: "idle" | "syncing" | "error" | "offline";
  phase?: "initial" | "background";
  progress?: {
    current: number;
    total: number;
  };
  lastSyncAt?: number;
  initialSyncCompletedAt?: number;
  fullSyncCompletedAt?: number;
  syncMode?: SyncMode;
  fullSyncPending?: boolean;
  error?: string;
}

// RPC schema for typed communication between main and renderer
export type RadiusRPC = {
  bun: {
    requests: {
      getInbox: {
        params: { limit: number; offset: number };
        response: { messages: Message[]; total: number };
      };
      searchInbox: {
        params: { query: string; limit: number; offset: number };
        response: { messages: Message[]; total: number };
      };
      getMessage: {
        params: { id: string };
        response: Message | null;
      };
      getSyncStatus: {
        params: {};
        response: SyncStatus;
      };
      openExternalUrl: {
        params: { url: string };
        response: { success: boolean; error?: string };
      };
      startOAuth: {
        params: { syncMode: SyncMode };
        response: { success: boolean; error?: string };
      };
      startSync: {
        params: { syncMode?: SyncMode };
        response: { success: boolean; error?: string };
      };
      markMessageRead: {
        params: { id: string };
        response: {
          success: boolean;
          error?: string;
          code?: "reauth_required" | "remote_sync_failed";
          localStateApplied?: boolean;
        };
      };
      requestNotificationPermission: {
        params: {};
        response: { success: boolean; error?: string };
      };
      openNotificationSettings: {
        params: {};
        response: { success: boolean; error?: string };
      };
      checkForUpdate: {
        params: {};
        response: UpdateInfo;
      };
      downloadUpdate: {
        params: {};
        response: { success: boolean; error?: string };
      };
      applyUpdate: {
        params: {};
        response: { success: boolean; error?: string };
      };
      getLocalReleaseInfo: {
        params: {};
        response: LocalReleaseInfo;
      };
      getAccounts: {
        params: {};
        response: {
          accounts: Array<{ email: string; name: string; addedAt: number }>;
          activeAccount: string | null;
        };
      };
      switchAccount: {
        params: { email: string | null };
        response: { success: boolean; error?: string };
      };
    };
    messages: {
      ready: {};
    };
  };
  webview: {
    requests: {
      // Renderer can expose handlers if needed
      ping: {
        params: {};
        response: "pong";
      };
    };
    messages: {
      syncProgress: SyncStatus;
      newMail: Message;
      updateStatus: UpdateInfo;
    };
  };
};
