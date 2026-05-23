import { ImapFlow } from "imapflow";

export interface ImapMessage {
  uid: number;
  seq: number | undefined;
  flags: Set<string>;
  envelope: {
    date: Date;
    subject: string;
    from: Array<{ name?: string; address?: string }>;
    to: Array<{ name?: string; address?: string }>;
    messageId: string;
    inReplyTo?: string;
    references?: string;
  };
  bodyStructure: Record<string, unknown>;
  bodyParts?: Map<string, Uint8Array>;
  internalDate: Date;
  size: number;
}

export interface ImapFolder {
  path: string;
  delimiter: string;
  flags: string[];
  specialUse: string | null;
  listed: boolean;
  subscribed: boolean;
  name: string;
}

export interface ImapConnectionConfig {
  host: string;
  port: number;
  useTls: boolean;
  email: string;
  password: string;
}

function formatAddress(addr: { name?: string; address?: string }): string {
  if (addr.name && addr.name !== addr.address) {
    return `${addr.name} <${addr.address}>`;
  }
  return addr.address ?? "";
}

function formatAddresses(addrs: Array<{ name?: string; address?: string }>): string {
  return addrs.map(formatAddress).join(", ");
}

function decodeRfc2047(input: string): string {
  try {
    return input.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, encoding, text) => {
      if (encoding.toUpperCase() === "B") {
        return Buffer.from(text, "base64").toString("utf-8");
      }
      if (encoding.toUpperCase() === "Q") {
        const bytes: number[] = [];
        let i = 0;
        while (i < text.length) {
          if (text[i] === "=" && i + 2 < text.length) {
            bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
            i += 3;
          } else if (text[i] === "_") {
            bytes.push(0x20);
            i += 1;
          } else {
            bytes.push(text.charCodeAt(i));
            i += 1;
          }
        }
        return Buffer.from(bytes).toString("utf-8");
      }
      return text;
    });
  } catch {
    return input;
  }
}

export interface FetchOptions {
  maxResults?: number;
}

export async function connect(config: ImapConnectionConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.useTls,
    auth: {
      user: config.email,
      pass: config.password,
    },
    logger: false,
  });

  await client.connect();
  return client;
}

export async function disconnect(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    // ignore logout errors
  }
}

export async function listFolders(client: ImapFlow): Promise<ImapFolder[]> {
  const folders = await client.list();
  return folders.map((f) => ({
    path: f.path,
    delimiter: f.delimiter,
    flags: Array.isArray(f.flags) ? f.flags : [...f.flags],
    specialUse: f.specialUse ?? null,
    listed: f.listed,
    subscribed: f.subscribed ?? true,
    name: f.path.split(f.delimiter).pop() ?? f.path,
  }));
}

export const STANDARD_FOLDERS: Record<string, "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive"> = {
  "\\Inbox": "inbox",
  "\\Sent": "sent",
  "\\SentItems": "sent",
  "\\Drafts": "drafts",
  "\\Trash": "trash",
  "\\Junk": "spam",
  "\\Spam": "spam",
  "\\Archive": "archive",
  "\\AllMail": "archive",
};

export function detectFolderKind(folder: ImapFolder): "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive" | "custom" {
  if (folder.specialUse && STANDARD_FOLDERS[folder.specialUse]) {
    return STANDARD_FOLDERS[folder.specialUse];
  }

  const name = folder.name.toLowerCase();
  if (name === "inbox" || name === "inbox") return "inbox";
  if (name === "sent" || name === "sent items" || name === "sent messages") return "sent";
  if (name === "drafts" || name === "draft") return "drafts";
  if (name === "trash" || name === "deleted items" || name === "bin") return "trash";
  if (name === "spam" || name === "junk" || name === "junk email") return "spam";
  if (name === "archive" || name === "all mail") return "archive";

  return "custom";
}

export async function fetchMessageUids(
  client: ImapFlow,
  folder: string,
  opts?: { sinceUid?: number }
): Promise<number[]> {
  const lock = await client.getMailboxLock(folder);
  try {
    let searchQuery: string;
    if (opts?.sinceUid && opts.sinceUid > 0) {
      searchQuery = `UID ${opts.sinceUid + 1}:*`;
    } else {
      searchQuery = "1:*";
    }

    if (!client.mailbox || !client.mailbox.exists) return [];

    const messages: number[] = [];
    for await (const msg of client.fetch(searchQuery, { uid: true })) {
      messages.push(msg.uid);
    }
    return messages;
  } finally {
    lock.release();
  }
}

export async function fetchMessages(
  client: ImapFlow,
  folder: string,
  uids: number[],
  limit?: number
): Promise<ImapMessage[]> {
  if (uids.length === 0) return [];

  const batch = limit && limit < uids.length ? uids.slice(0, limit) : uids;
  if (batch.length === 0) return [];

  const lock = await client.getMailboxLock(folder);
  try {
    const results: ImapMessage[] = [];
    const uidSet = batch.join(",");
    for await (const msg of client.fetch(`${uidSet}`, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
      internalDate: true,
      size: true,
    })) {
      results.push({
        uid: msg.uid,
        seq: msg.seq,
        flags: new Set(msg.flags ? [...msg.flags] : []),
        envelope: msg.envelope as unknown as ImapMessage["envelope"],
        bodyStructure: (msg.bodyStructure ?? {}) as Record<string, unknown>,
        bodyParts: msg.bodyParts,
        internalDate: msg.internalDate instanceof Date ? msg.internalDate : new Date(msg.internalDate ?? Date.now()),
        size: msg.size ?? 0,
      });
    }
    return results;
  } finally {
    lock.release();
  }
}

export async function fetchMessageBody(
  client: ImapFlow,
  folder: string,
  uid: number
): Promise<{ text: string | null; html: string | null }> {
  const lock = await getMailboxLockSafe(client, folder);
  try {
    const msg = await client.fetchOne(uid, {
      uid: true,
      bodyParts: ["TEXT"],
      source: true,
    });

    if (!msg) return { text: null, html: null };

    let text: string | null = null;
    let html: string | null = null;

    if (msg.bodyParts) {
      for (const [partPath, data] of msg.bodyParts) {
        const decoded = data instanceof Uint8Array ? Buffer.from(data).toString("utf-8") : String(data);
        const lower = partPath.toLowerCase();
        if (lower.includes("text/plain") || lower === "text") {
          text = decoded;
        } else if (lower.includes("text/html")) {
          html = decoded;
        }
      }
    }

    if (!text && !html && msg.source) {
      const decoded = msg.source instanceof Uint8Array ? Buffer.from(msg.source).toString("utf-8") : String(msg.source);
      text = decoded;
    }

    return { text, html };
  } catch (err) {
    console.error(`Failed to fetch body for UID ${uid}:`, err);
    return { text: null, html: null };
  } finally {
    lock.release();
  }
}

export async function getFolderUnseenCount(client: ImapFlow, folder: string): Promise<number> {
  const lock = await getMailboxLockSafe(client, folder);
  try {
    const status = await client.status(folder, { unseen: true });
    return status.unseen ?? 0;
  } finally {
    lock.release();
  }
}

export async function getFolderCount(client: ImapFlow, folder: string): Promise<number> {
  const lock = await getMailboxLockSafe(client, folder);
  try {
    const status = await client.status(folder, { messages: true });
    return status.messages ?? 0;
  } finally {
    lock.release();
  }
}

async function getMailboxLockSafe(client: ImapFlow, folder: string) {
  try {
    return await client.getMailboxLock(folder);
  } catch (err) {
    console.error(`Failed to acquire mailbox lock for ${folder}:`, err);
    throw err;
  }
}

export async function markAsSeen(client: ImapFlow, folder: string, uid: number): Promise<void> {
  const lock = await getMailboxLockSafe(client, folder);
  try {
    await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
  } finally {
    lock.release();
  }
}

export async function moveToTrash(client: ImapFlow, sourceFolder: string, uid: number, trashFolder: string): Promise<void> {
  const lock = await getMailboxLockSafe(client, sourceFolder);
  try {
    await client.messageMove({ uid }, trashFolder, { uid: true });
  } catch (err) {
    console.error(`Failed to move UID ${uid} to trash folder "${trashFolder}":`, err);
  } finally {
    lock.release();
  }
}

export async function permanentlyDelete(client: ImapFlow, folder: string, uid: number): Promise<void> {
  const lock = await getMailboxLockSafe(client, folder);
  try {
    await client.messageDelete({ uid }, { uid: true });
  } finally {
    lock.release();
  }
}

export async function testConnection(config: ImapConnectionConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await connect(config);
    await disconnect(client);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export { decodeRfc2047, formatAddress, formatAddresses };
