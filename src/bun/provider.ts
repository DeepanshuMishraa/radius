import type { EmailProviderType, ImapSettings } from "../shared/types";

export interface FetchedMessage {
  id: string;
  threadId: string;
  internalDate: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
  isRead: boolean;
  isInbox: boolean;
  isSent: boolean;
  isDraft: boolean;
  isTrash: boolean;
  category: string;
}

export interface HistoryItem {
  id: string;
  messagesAdded?: Array<{ message: { id: string } }>;
  labelsAdded?: Array<{ message: { id: string } }>;
  labelsRemoved?: Array<{ message: { id: string } }>;
}

export interface ListMessagesResult {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GetHistoryResult {
  history?: HistoryItem[];
  historyId?: string;
  nextPageToken?: string;
}

export interface EmailProvider {
  readonly type: EmailProviderType;
  readonly email: string;

  authenticate(): Promise<void>;

  listMessages(opts?: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
  }): Promise<ListMessagesResult>;

  getMessage(id: string): Promise<FetchedMessage>;
  getMessageMetadata(id: string): Promise<FetchedMessage>;

  getHistory(startHistoryId: string, opts?: {
    pageToken?: string;
    historyTypes?: string[];
    labelId?: string;
  }): Promise<GetHistoryResult>;

  markAsRead(id: string): Promise<void>;
  trashMessage(id: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  getAttachment(messageId: string, attachmentId: string): Promise<string>;

  extractBodies(message: FetchedMessage): Promise<{
    text: string | null;
    html: string | null;
    attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
  }>;
}

export interface ImapProviderSettings {
  email: string;
  password: string;
  imapSettings: ImapSettings;
}

const providerInstances = new Map<string, EmailProvider>();

export function registerProvider(email: string, provider: EmailProvider): void {
  providerInstances.set(email, provider);
}

export function getProvider(email: string): EmailProvider | undefined {
  return providerInstances.get(email);
}

export function removeProvider(email: string): void {
  providerInstances.delete(email);
}

export function clearProviders(): void {
  providerInstances.clear();
}
