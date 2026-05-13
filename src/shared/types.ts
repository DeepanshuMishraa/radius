// Shared RPC types for Electrobun's defineRPC
// Imported by both main process (Bun) and renderer (browser)

import { z } from "zod";

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

export interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface ComposeAttachmentInput {
  id: string;
  type: "file" | "image" | "link";
  name: string;
  mimeType?: string;
  size?: number;
  dataBase64?: string;
  url?: string;
}

export interface ComposeSession {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  attachments: ComposeAttachmentInput[];
  gmailDraftId: string | null;
  gmailMessageId: string | null;
  status: "editing" | "queued" | "sent" | "failed" | "discarded";
  dirty: boolean;
  createdAt: number;
  updatedAt: number;
  lastSavedAt: number | null;
}

export interface ComposeStatusMessage {
  sessionId: string;
  sendId?: string;
  status:
    | "draft_saved"
    | "send_queued"
    | "send_sent"
    | "send_failed"
    | "send_undone";
  undoDeadlineAt?: number;
  error?: string;
}

export interface ComposeContactSuggestion {
  name: string;
  email: string;
  label: string;
  source: "recent" | "account" | "manual" | "history";
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
  attachments: Attachment[];
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
export const urlSchema = z.string().refine(
  (val) => {
    const trimmed = val.trim();
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      // Only retry with https:// for scheme-less inputs.
      // If it already looks like a scheme, the first parse failing means it's malformed.
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
      try {
        const parsed = new URL(`https://${trimmed}`);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    }
  },
  { message: "Invalid URL" },
);

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
      getMailboxMessages: {
        params: { mailbox: "sent" | "drafts" | "trash"; limit?: number };
        response: { messages: Message[]; total: number };
      };
      getMessage: {
        params: { id: string };
        response: Message | null;
      };
      getComposeSuggestions: {
        params: { query?: string; limit?: number };
        response: { contacts: ComposeContactSuggestion[] };
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
      createComposeSession: {
        params: { from: string };
        response: {
          success: boolean;
          session?: ComposeSession;
          error?: string;
        };
      };
      updateComposeSession: {
        params: {
          sessionId: string;
          from: string;
          to: string[];
          cc?: string[];
          bcc?: string[];
          subject: string;
          bodyText: string;
          attachments?: ComposeAttachmentInput[];
        };
        response: {
          success: boolean;
          session?: ComposeSession;
          error?: string;
        };
      };
      saveDraft: {
        params: {
          sessionId: string;
        };
        response: {
          success: boolean;
          sessionId?: string;
          draftId?: string;
          messageId?: string;
          lastSavedAt?: number;
          error?: string;
          code?: "reauth_required" | "scope_insufficient";
        };
      };
      queueSend: {
        params: {
          sessionId: string;
        };
        response: {
          success: boolean;
          sessionId?: string;
          sendId?: string;
          undoDeadlineAt?: number;
          error?: string;
          code?: "reauth_required" | "scope_insufficient";
        };
      };
      undoSend: {
        params: {
          sendId: string;
        };
        response: {
          success: boolean;
          sessionId?: string;
          error?: string;
        };
      };
      discardComposeSession: {
        params: {
          sessionId: string;
          deleteRemoteDraft?: boolean;
        };
        response: {
          success: boolean;
          error?: string;
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
      getSystemFullName: {
        params: {};
        response: { name: string };
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
      removeAccount: {
        params: { email: string };
        response: { success: boolean; error?: string };
      };
      resyncAccount: {
        params: {};
        response: { success: boolean; error?: string };
      };
      downloadAttachment: {
        params: { messageId: string; attachmentId: string };
        response: { success: boolean; data?: string; mimeType?: string; filename?: string; error?: string };
      };
      previewAttachment: {
        params: { messageId: string; attachmentId: string; filename: string };
        response: { success: boolean; error?: string };
      };
      getSenderAvatars: {
        params: { domains: string[]; emails?: string[] };
        response: { avatars: Record<string, string | null> };
      };
      getAllSenderAvatars: {
        params: {};
        response: { avatars: Record<string, string | null> };
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
      composeStatusChanged: ComposeStatusMessage;
    };
  };
};
