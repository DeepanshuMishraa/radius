import { ImapFlow } from "imapflow";
import type { ImapSettings } from "../shared/types";
import type { EmailProvider, FetchedMessage, ListMessagesResult, GetHistoryResult } from "./provider";
import {
  connect,
  disconnect,
  listFolders,
  detectFolderKind,
  fetchMessageUids,
  fetchMessages,
  fetchMessageBody,
  markAsSeen,
  moveToTrash,
  permanentlyDelete,
  testConnection,
  decodeRfc2047,
  formatAddresses,
  type ImapConnectionConfig,
} from "./imap";
import { classifyMessageNature } from "./gmail";
import { getImapPassword, storeImapPassword } from "./auth";

function classifyContent(msg: {
  from: string;
  subject: string;
  snippet: string;
  bodyText?: string | null;
}): string {
  return classifyMessageNature({
    from: msg.from,
    subject: msg.subject,
    snippet: msg.snippet,
    bodyText: msg.bodyText,
  });
}

function makeMessageId(email: string, uid: number): string {
  return `imap:${email}:${uid}`;
}

function parseMessageId(fullId: string): { email: string; uid: number } | null {
  const parts = fullId.split(":");
  if (parts.length !== 3 || parts[0] !== "imap") return null;
  return { email: parts[1], uid: parseInt(parts[2], 10) };
}

export class ImapProvider implements EmailProvider {
  readonly type = "imap" as const;
  readonly email: string;
  private config: ImapConnectionConfig | null = null;

  constructor(email: string) {
    this.email = email;
  }

  async setPassword(password: string, imapSettings: ImapSettings): Promise<void> {
    this.config = {
      host: imapSettings.host,
      port: imapSettings.port,
      useTls: imapSettings.useTls,
      email: this.email,
      password,
    };
    await storeImapPassword(this.email, JSON.stringify(imapSettings));
  }

  private async getClient(): Promise<ImapFlow> {
    if (!this.config) {
      const stored = await getImapPassword(this.email);
      if (!stored) {
        throw new Error(`IMAP credentials not found for ${this.email}`);
      }
      const parsed = JSON.parse(stored) as { imapSettings: ImapSettings; password: string };
      this.config = {
        host: parsed.imapSettings.host,
        port: parsed.imapSettings.port,
        useTls: parsed.imapSettings.useTls,
        email: this.email,
        password: parsed.password,
      };
    }
    return connect(this.config);
  }

  async authenticate(): Promise<void> {
    const client = await this.getClient();
    await disconnect(client);
  }

  async testConnection(password: string, imapSettings: ImapSettings): Promise<{ success: boolean; error?: string }> {
    return testConnection({
      host: imapSettings.host,
      port: imapSettings.port,
      useTls: imapSettings.useTls,
      email: this.email,
      password,
    });
  }

  async listMessages(opts?: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
  }): Promise<ListMessagesResult> {
    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      const inbox = folders.find((f) => detectFolderKind(f) === "inbox");
      if (!inbox) return {};

      const uids = await fetchMessageUids(client, inbox.path, {});
      const limit = opts?.maxResults ?? 100;
      const fetched = await fetchMessages(client, inbox.path, uids, limit);

      return {
        messages: fetched.map((m) => ({
          id: makeMessageId(this.email, m.uid),
          threadId: makeMessageId(this.email, m.uid),
        })),
        resultSizeEstimate: uids.length,
      };
    } finally {
      await disconnect(client);
    }
  }

  async getMessage(id: string): Promise<FetchedMessage> {
    const parsed = parseMessageId(id);
    if (!parsed) throw new Error(`Invalid IMAP message ID: ${id}`);

    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      const inbox = folders.find((f) => detectFolderKind(f) === "inbox");
      if (!inbox) throw new Error("No inbox folder found");

      const messages = await fetchMessages(client, inbox.path, [parsed.uid], 1);
      if (messages.length === 0) throw new Error(`Message not found: ${id}`);

      const msg = messages[0];
      const body = await fetchMessageBody(client, inbox.path, parsed.uid);

      const from = msg.envelope.from ? formatAddresses(msg.envelope.from) : "";
      const to = msg.envelope.to ? formatAddresses(msg.envelope.to) : this.email;
      const subject = decodeRfc2047(msg.envelope.subject || "");
      const snippet = (body.text || body.html || "").slice(0, 200);

      return {
        id,
        threadId: id,
        internalDate: String(msg.internalDate.getTime()),
        snippet,
        from,
        to,
        subject,
        bodyText: body.text,
        bodyHtml: body.html,
        attachments: [],
        isRead: msg.flags.has("\\Seen"),
        isInbox: true,
        isSent: false,
        isDraft: false,
        isTrash: false,
        category: classifyContent({ from, subject, snippet, bodyText: body.text }),
      };
    } finally {
      await disconnect(client);
    }
  }

  async getMessageMetadata(id: string): Promise<FetchedMessage> {
    return this.getMessage(id);
  }

  async getHistory(_startHistoryId: string, _opts?: {
    pageToken?: string;
    historyTypes?: string[];
    labelId?: string;
  }): Promise<GetHistoryResult> {
    return {};
  }

  async markAsRead(id: string): Promise<void> {
    const parsed = parseMessageId(id);
    if (!parsed) return;

    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      const inbox = folders.find((f) => detectFolderKind(f) === "inbox");
      if (inbox) {
        await markAsSeen(client, inbox.path, parsed.uid);
      }
    } finally {
      await disconnect(client);
    }
  }

  async trashMessage(id: string): Promise<void> {
    const parsed = parseMessageId(id);
    if (!parsed) return;

    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      const inbox = folders.find((f) => detectFolderKind(f) === "inbox");
      if (inbox) {
        await moveToTrash(client, inbox.path, parsed.uid);
      }
    } finally {
      await disconnect(client);
    }
  }

  async deleteMessage(id: string): Promise<void> {
    const parsed = parseMessageId(id);
    if (!parsed) return;

    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      const inbox = folders.find((f) => detectFolderKind(f) === "inbox");
      if (inbox) {
        await permanentlyDelete(client, inbox.path, parsed.uid);
      }
    } finally {
      await disconnect(client);
    }
  }

  async getAttachment(_messageId: string, _attachmentId: string): Promise<string> {
    throw new Error("Attachment download not yet supported for IMAP accounts");
  }

  async extractBodies(message: FetchedMessage): Promise<{
    text: string | null;
    html: string | null;
    attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
  }> {
    return { text: message.bodyText, html: message.bodyHtml, attachments: message.attachments };
  }

  async fetchFolderMessages(folderKind: "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive"): Promise<FetchedMessage[]> {
    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      const folder = folders.find((f) => detectFolderKind(f) === folderKind);
      if (!folder) return [];

      const uids = await fetchMessageUids(client, folder.path, {});
      const fetched = await fetchMessages(client, folder.path, uids);

      const results: FetchedMessage[] = [];
      for (const msg of fetched) {
        const id = makeMessageId(this.email, msg.uid);
        const from = msg.envelope.from ? formatAddresses(msg.envelope.from) : "";
        const to = msg.envelope.to ? formatAddresses(msg.envelope.to) : this.email;
        const subject = decodeRfc2047(msg.envelope.subject || "");

        results.push({
          id,
          threadId: id,
          internalDate: String(msg.internalDate.getTime()),
          snippet: "",
          from,
          to,
          subject,
          bodyText: null,
          bodyHtml: null,
          attachments: [],
          isRead: msg.flags.has("\\Seen"),
          isInbox: folderKind === "inbox",
          isSent: folderKind === "sent",
          isDraft: folderKind === "drafts",
          isTrash: folderKind === "trash",
          category: classifyContent({ from, subject, snippet: "" }),
        });
      }

      return results;
    } finally {
      await disconnect(client);
    }
  }

  async listFolders(): Promise<Array<{ path: string; kind: string; name: string }>> {
    const client = await this.getClient();
    try {
      const folders = await listFolders(client);
      return folders.map((f) => ({
        path: f.path,
        kind: detectFolderKind(f),
        name: f.name,
      }));
    } finally {
      await disconnect(client);
    }
  }
}

export { parseMessageId, makeMessageId };
