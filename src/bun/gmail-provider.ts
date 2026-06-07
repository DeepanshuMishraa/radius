import { getValidAccessTokenForEmail } from "./auth";
import {
  listMessages as gmailListMessages,
  getMessage as gmailGetMessage,
  getMessageMetadata as gmailGetMessageMetadata,
  getHistory as gmailGetHistory,
  getAttachment as gmailGetAttachment,
  modifyMessageLabels,
  deleteMessage as gmailDeleteMessage,
  trashMessage as gmailTrashMessage,
  parseHeaders,
  classifyMessageNature,
  isReadFromLabels,
  type GmailMessage,
} from "./gmail";
import type {
  EmailProvider,
  FetchedMessage,
  ListMessagesResult,
  GetHistoryResult,
  HistoryItem,
} from "./provider";

function getMailboxFlags(labelIds: string[] | undefined) {
  const labels = new Set((labelIds ?? []).map((l) => l.toUpperCase()));
  return {
    isInbox: labels.has("INBOX"),
    isSent: labels.has("SENT"),
    isDraft: labels.has("DRAFT"),
    isTrash: labels.has("TRASH"),
  };
}

function extractUnsubscribeHeaders(
  headers: Record<string, string>
): { listUnsubscribe: string | null; listId: string | null } {
  return {
    listUnsubscribe: headers["list-unsubscribe"] ?? null,
    listId: headers["list-id"] ?? null,
  };
}

function toFetchedMessage(msg: GmailMessage): FetchedMessage {
  const headers = parseHeaders(msg.payload.headers ?? []);
  return {
    id: msg.id,
    threadId: msg.threadId,
    internalDate: msg.internalDate,
    snippet: msg.snippet,
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    bodyText: null,
    bodyHtml: null,
    attachments: [],
    isRead: isReadFromLabels(msg.labelIds),
    ...getMailboxFlags(msg.labelIds),
    category: classifyMessageNature({
      labelIds: msg.labelIds,
      from: headers["from"],
      subject: headers["subject"],
      snippet: msg.snippet,
    }),
    ...extractUnsubscribeHeaders(headers),
  };
}

function gmailToFetchedMessage(msg: GmailMessage, bodies?: { text: string | null; html: string | null; attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> }): FetchedMessage {
  const headers = parseHeaders(msg.payload.headers ?? []);
  return {
    id: msg.id,
    threadId: msg.threadId,
    internalDate: msg.internalDate,
    snippet: msg.snippet,
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    bodyText: bodies?.text ?? null,
    bodyHtml: bodies?.html ?? null,
    attachments: bodies?.attachments ?? [],
    isRead: isReadFromLabels(msg.labelIds),
    ...getMailboxFlags(msg.labelIds),
    category: classifyMessageNature({
      labelIds: msg.labelIds,
      from: headers["from"],
      subject: headers["subject"],
      snippet: msg.snippet,
      bodyText: bodies?.text,
    }),
    ...extractUnsubscribeHeaders(headers),
  };
}

export class GmailProvider implements EmailProvider {
  readonly type = "gmail" as const;
  readonly email: string;

  constructor(email: string) {
    this.email = email;
  }

  async authenticate(): Promise<void> {
    await getValidAccessTokenForEmail(this.email);
  }

  async listMessages(opts?: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
  }): Promise<ListMessagesResult> {
    const token = await getValidAccessTokenForEmail(this.email);
    const result = await gmailListMessages(token, opts ?? {});
    return {
      messages: result.messages,
      nextPageToken: result.nextPageToken,
      resultSizeEstimate: result.resultSizeEstimate,
    };
  }

  async getMessage(id: string): Promise<FetchedMessage> {
    const token = await getValidAccessTokenForEmail(this.email);
    const msg = await gmailGetMessage(token, id);
    return gmailToFetchedMessage(msg);
  }

  async getMessageMetadata(id: string): Promise<FetchedMessage> {
    const token = await getValidAccessTokenForEmail(this.email);
    const msg = await gmailGetMessageMetadata(token, id);
    return toFetchedMessage(msg);
  }

  async getHistory(startHistoryId: string, opts?: {
    pageToken?: string;
    historyTypes?: string[];
    labelId?: string;
  }): Promise<GetHistoryResult> {
    const token = await getValidAccessTokenForEmail(this.email);
    const result = await gmailGetHistory(token, startHistoryId, opts ?? {});
    return {
      history: result.history as HistoryItem[] | undefined,
      historyId: result.historyId,
      nextPageToken: result.nextPageToken,
    };
  }

  async markAsRead(id: string): Promise<void> {
    const token = await getValidAccessTokenForEmail(this.email);
    await modifyMessageLabels(token, id, { removeLabelIds: ["UNREAD"] });
  }

  async trashMessage(id: string): Promise<void> {
    const token = await getValidAccessTokenForEmail(this.email);
    await gmailTrashMessage(token, id);
  }

  async deleteMessage(id: string): Promise<void> {
    const token = await getValidAccessTokenForEmail(this.email);
    await gmailDeleteMessage(token, id);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<string> {
    const token = await getValidAccessTokenForEmail(this.email);
    return gmailGetAttachment(token, messageId, attachmentId);
  }

  async extractBodies(message: FetchedMessage): Promise<{
    text: string | null;
    html: string | null;
    attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
  }> {
    return { text: message.bodyText, html: message.bodyHtml, attachments: message.attachments };
  }
}

export { gmailToFetchedMessage, toFetchedMessage as gmailToMetadataMessage };
