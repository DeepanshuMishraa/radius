// Shared RPC types for Electrobun's defineRPC
// Imported by both main process (Bun) and renderer (browser)

export interface Message {
  id: string;
  threadId: string;
  historyId: string;
  internalDate: number;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
}

export interface SyncStatus {
  status: "idle" | "syncing" | "error" | "offline";
  progress?: {
    current: number;
    total: number;
  };
  lastSyncAt?: number;
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
      syncProgress: SyncStatus;
      newMail: Message;
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
      // Renderer can receive messages
      ready: {};
    };
  };
};
