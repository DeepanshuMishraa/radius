// Shared RPC types for Electrobun's defineRPC
// Imported by both main process (Bun) and renderer (browser)

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
        params: {};
        response: { success: boolean; error?: string };
      };
      startSync: {
        params: {};
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
    };
  };
};
