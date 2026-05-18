import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  ComposeAttachmentInput,
  ComposeSession,
  ComposeStatusMessage,
  RadiusRPC,
} from "../shared/types";
import { getValidAccessTokenForEmail } from "./auth";
import { APP_SUPPORT_DIR, getDb, getMessageById, insertMessage, upsertComposeContacts } from "./db";
import {
  createDraft,
  deleteDraft,
  GmailAPIError,
  getMessage as getGmailMessage,
  parseHeaders,
  sendMessage,
  updateDraft,
} from "./gmail";

const COMPOSE_DIR = join(APP_SUPPORT_DIR, "compose");
const ATTACHMENTS_DIR = join(COMPOSE_DIR, "attachments");
const UNDO_SEND_MS = 10_000;
const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024;

type PendingSendSnapshot = {
  sessionId: string;
  mode: ComposeSession["mode"];
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  threadId: string | null;
  replyToMessageId: string | null;
  replyReferences: string[];
  originalMessageId: string | null;
  gmailDraftId: string | null;
  attachments: Array<{
    id: string;
    type: "file" | "image" | "link";
    name: string;
    mimeType?: string;
    size?: number;
    localPath?: string | null;
    url?: string | null;
  }>;
};

type ComposeSessionRow = {
  id: string;
  from_addr: string;
  to_recipients: string;
  cc_recipients: string;
  bcc_recipients: string;
  subject: string;
  body_text: string;
  mode: ComposeSession["mode"];
  fixed_recipients: number;
  thread_id: string | null;
  reply_to_message_id: string | null;
  reply_references: string;
  original_message_id: string | null;
  gmail_draft_id: string | null;
  gmail_message_id: string | null;
  status: ComposeSession["status"];
  dirty: number;
  created_at: number;
  updated_at: number;
  last_saved_at: number | null;
};

type ComposeAttachmentRow = {
  id: string;
  type: ComposeAttachmentInput["type"];
  name: string;
  mime_type: string | null;
  size: number | null;
  local_path: string | null;
  content_hash: string | null;
  url: string | null;
};

type PendingSendRow = {
  id: string;
  session_id: string;
  account_email: string;
  payload_json: string;
  status: "queued" | "sending" | "sent" | "cancelled" | "failed";
  undo_deadline_at: number;
  error: string | null;
};

const sendTimers = new Map<string, ReturnType<typeof setTimeout>>();
let emitComposeStatus: (message: ComposeStatusMessage) => void = () => {};

export function setEmitComposeStatus(fn: (message: ComposeStatusMessage) => void) {
  emitComposeStatus = fn;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function normalizeSubjectPrefix(subject: string, prefix: "Re" | "Fwd"): string {
  const trimmed = subject.trim();
  if (!trimmed) return `${prefix}:`;
  const pattern = new RegExp(`^${prefix}:\\s*`, "i");
  return pattern.test(trimmed) ? trimmed : `${prefix}: ${trimmed}`;
}

function stripQuotedText(text: string | null | undefined): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const lines = normalized.split("\n");
  const quoteStart = lines.findIndex((line) => /^>/.test(line.trim()) || /^On .+wrote:$/i.test(line.trim()));
  const sliced = quoteStart === -1 ? lines : lines.slice(0, quoteStart);
  return sliced.join("\n").trim();
}

function buildReplyQuote(message: {
  from: string;
  to: string;
  subject: string;
  internalDate: number;
  bodyText: string | null;
  snippet: string;
}): string {
  const sourceText = stripQuotedText(message.bodyText) || message.snippet.trim();
  const quoted = sourceText
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
    .trim();
  const dateLabel = new Date(message.internalDate).toLocaleString();
  const summary = `On ${dateLabel}, ${message.from || "someone"} wrote:`;
  return quoted ? `\n\n${summary}\n${quoted}` : `\n\n${summary}`;
}

function buildForwardBody(message: {
  from: string;
  to: string;
  subject: string;
  internalDate: number;
  bodyText: string | null;
  snippet: string;
}): string {
  const body = stripQuotedText(message.bodyText) || message.snippet.trim();
  const dateLabel = new Date(message.internalDate).toLocaleString();
  return [
    "",
    "",
    "---------- Forwarded message ---------",
    `From: ${message.from || ""}`,
    `Date: ${dateLabel}`,
    `Subject: ${message.subject || ""}`,
    `To: ${message.to || ""}`,
    "",
    body,
  ]
    .join("\n")
    .trimEnd();
}

function sanitizeFilename(name: string): string {
  const trimmed = basename(name || "attachment").trim();
  return trimmed.replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "attachment";
}

function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function normalizeRecipient(email: string): string {
  return sanitizeHeaderText(email).trim().toLowerCase();
}

function normalizeRecipients(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    const email = normalizeRecipient(value);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }
  return normalized;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapComposeError(err: unknown): {
  error: string;
  code?: "reauth_required" | "scope_insufficient";
} {
  if (
    err instanceof GmailAPIError &&
    err.status === 403 &&
    err.body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
  ) {
    return {
      error:
        "Compose needs fresh Gmail compose permission. Reconnect Gmail once to enable sending.",
      code: "scope_insufficient",
    };
  }

  if (err instanceof GmailAPIError && err.isAuthError()) {
    return {
      error: "Gmail authentication expired. Reconnect Gmail and try again.",
      code: "reauth_required",
    };
  }

  return { error: String(err) };
}

async function ensureComposeDirs() {
  await mkdir(ATTACHMENTS_DIR, { recursive: true });
}

async function deleteFileIfPresent(path: string | null | undefined) {
  if (!path) return;
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to delete staged attachment ${path}:`, err);
    }
  }
}

function getLinkAttachmentText(attachments: ComposeAttachmentInput[]): string[] {
  return attachments
    .filter((attachment) => attachment.type === "link" && attachment.url)
    .map((attachment) => attachment.url as string);
}

function appendLinksToBody(bodyText: string, attachments: ComposeAttachmentInput[]): string {
  const links = getLinkAttachmentText(attachments);
  if (links.length === 0) return bodyText;
  const suffix = `\n\nLinks\n${links.map((url) => `- ${url}`).join("\n")}`;
  return `${bodyText}${suffix}`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderRichBodyHtml(bodyText: string): string | null {
  const normalized = bodyText.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return null;

  const html: string[] = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const formatInline = (input: string) =>
    escapeHtml(input)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*(.+?)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const line of normalized.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      flushList();
      html.push("<p><br/></p>");
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(trimmedLine.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    flushList();
    html.push(`<p>${formatInline(trimmedLine)}</p>`);
  }

  flushList();
  return html.join("");
}

function hasMeaningfulContent(session: ComposeSession): boolean {
  return Boolean(
    session.to.length > 0 &&
      (session.subject.trim() ||
        session.bodyText.trim() ||
        session.attachments.length > 0),
  );
}

function validateSessionForRemote(session: ComposeSession): string | null {
  if (!session.from.trim()) return "Select a sender account first.";
  if (session.to.length === 0) return "Add at least one recipient.";

  for (const email of [...session.to, ...session.cc, ...session.bcc]) {
    if (!isValidEmail(email)) {
      return `Invalid recipient: ${email}`;
    }
  }

  if (!session.subject.trim() && !session.bodyText.trim() && session.attachments.length === 0) {
    return "Write a subject or message before continuing.";
  }

  const binaryAttachments = session.attachments.filter((attachment) => attachment.type !== "link");
  if (binaryAttachments.length > MAX_ATTACHMENT_COUNT) {
    return `You can attach up to ${MAX_ATTACHMENT_COUNT} files.`;
  }

  const totalBytes = binaryAttachments.reduce(
    (sum, attachment) => sum + (attachment.size ?? 0),
    0,
  );
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return "Attachments are too large for Gmail send limits.";
  }

  for (const attachment of binaryAttachments) {
    if ((attachment.size ?? 0) > MAX_ATTACHMENT_BYTES) {
      return `${attachment.name} is too large to send.`;
    }
  }

  return null;
}

async function stageAttachment(
  sessionId: string,
  attachment: ComposeAttachmentInput,
  existingRow?: ComposeAttachmentRow,
): Promise<{ localPath: string | null; contentHash: string | null }> {
  if (attachment.type === "link") {
    if (existingRow?.local_path) {
      await deleteFileIfPresent(existingRow.local_path);
    }
    return { localPath: null, contentHash: null };
  }

  if (!attachment.dataBase64) {
    if (!existingRow?.local_path) {
      throw new Error(`Missing file data for attachment ${attachment.name}`);
    }
    return {
      localPath: existingRow.local_path,
      contentHash: existingRow.content_hash,
    };
  }

  const estimatedSize = attachment.size ?? Math.ceil(attachment.dataBase64.length * 0.75);
  if (estimatedSize > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `${attachment.name} exceeds the maximum attachment size of ${MAX_ATTACHMENT_BYTES} bytes.`,
    );
  }

  await ensureComposeDirs();
  const data = Buffer.from(attachment.dataBase64, "base64");
  const contentHash = createHash("sha256").update(data).digest("hex");
  if (contentHash === existingRow?.content_hash && existingRow.local_path) {
    return { localPath: existingRow.local_path, contentHash };
  }

  const fileExt = extname(attachment.name).slice(0, 12);
  const stagedName = `${sessionId}-${attachment.id}-${contentHash.slice(0, 12)}${fileExt}`;
  const localPath = join(ATTACHMENTS_DIR, stagedName);
  await writeFile(localPath, data);
  if (existingRow?.local_path && existingRow.local_path !== localPath) {
    await deleteFileIfPresent(existingRow.local_path);
  }
  return { localPath, contentHash };
}

async function hydrateAttachment(row: ComposeAttachmentRow): Promise<ComposeAttachmentInput> {
  let dataBase64: string | undefined;
  if (row.type !== "link" && row.local_path) {
    try {
      dataBase64 = (await readFile(row.local_path)).toString("base64");
    } catch (err) {
      console.warn(`Failed to hydrate attachment ${row.id}:`, err);
    }
  }

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    mimeType: row.mime_type ?? undefined,
    size: row.size ?? undefined,
    dataBase64,
    url:
      row.type === "image" && dataBase64 && row.mime_type
        ? `data:${row.mime_type};base64,${dataBase64}`
        : row.url ?? undefined,
  };
}

async function loadSessionById(db: Database, sessionId: string): Promise<ComposeSession | null> {
  const row = db
    .query(
      `SELECT id, from_addr, to_recipients, cc_recipients, bcc_recipients, subject,
              body_text, mode, fixed_recipients, thread_id, reply_to_message_id,
              reply_references, original_message_id, gmail_draft_id, gmail_message_id, status, dirty,
              created_at, updated_at, last_saved_at
       FROM compose_sessions
       WHERE id = ?`,
    )
    .get(sessionId) as ComposeSessionRow | null;

  if (!row) return null;

  const attachmentRows = db
    .query(
      `SELECT id, type, name, mime_type, size, local_path, content_hash, url
       FROM compose_attachments
       WHERE session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(sessionId) as ComposeAttachmentRow[];

  return {
    id: row.id,
    from: row.from_addr,
    to: parseJsonArray(row.to_recipients),
    cc: parseJsonArray(row.cc_recipients),
    bcc: parseJsonArray(row.bcc_recipients),
    subject: row.subject,
    bodyText: row.body_text,
    attachments: await Promise.all(attachmentRows.map(hydrateAttachment)),
    mode: row.mode ?? "compose",
    fixedRecipients: Boolean(row.fixed_recipients),
    threadId: row.thread_id,
    replyToMessageId: row.reply_to_message_id,
    replyReferences: parseJsonArray(row.reply_references),
    originalMessageId: row.original_message_id,
    gmailDraftId: row.gmail_draft_id,
    gmailMessageId: row.gmail_message_id,
    status: row.status,
    dirty: Boolean(row.dirty),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSavedAt: row.last_saved_at,
  };
}

export async function getComposeSessionById(sessionId: string): Promise<ComposeSession | null> {
  const db = await getDb();
  return loadSessionById(db, sessionId);
}

async function persistAttachments(
  db: Database,
  sessionId: string,
  attachments: ComposeAttachmentInput[],
) {
  const existingRows = db
    .query(
      `SELECT id, type, name, mime_type, size, local_path, content_hash, url
       FROM compose_attachments
       WHERE session_id = ?`,
    )
    .all(sessionId) as ComposeAttachmentRow[];
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const incomingIds = new Set(attachments.map((attachment) => attachment.id));

  for (const row of existingRows) {
    if (!incomingIds.has(row.id)) {
      await deleteFileIfPresent(row.local_path);
      db.run("DELETE FROM compose_attachments WHERE id = ?", [row.id]);
    }
  }

  for (const attachment of attachments) {
    const existing = existingById.get(attachment.id);
    const staged = await stageAttachment(sessionId, attachment, existing);
    db.run(
      `INSERT INTO compose_attachments
         (id, session_id, type, name, mime_type, size, local_path, content_hash, url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM compose_attachments WHERE id = ?), ?))
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         name = excluded.name,
         mime_type = excluded.mime_type,
         size = excluded.size,
         local_path = excluded.local_path,
         content_hash = excluded.content_hash,
         url = excluded.url`,
      [
        attachment.id,
        sessionId,
        attachment.type,
        sanitizeFilename(attachment.name),
        attachment.mimeType ?? null,
        attachment.size ?? null,
        staged.localPath,
        staged.contentHash,
        attachment.type === "link" ? attachment.url ?? null : null,
        attachment.id,
        Date.now(),
      ],
    );
  }
}

async function saveSessionState(
  input: {
    sessionId: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyText: string;
    attachments?: ComposeAttachmentInput[];
    status?: ComposeSession["status"];
    dirty?: boolean;
    mode?: ComposeSession["mode"];
    fixedRecipients?: boolean;
    threadId?: string | null;
    replyToMessageId?: string | null;
    replyReferences?: string[] | null;
    originalMessageId?: string | null;
    lastSavedAt?: number | null;
    gmailDraftId?: string | null;
    gmailMessageId?: string | null;
  },
): Promise<ComposeSession> {
  const db = await getDb();
  const now = Date.now();
  const from = sanitizeHeaderText(input.from);
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc);
  const bcc = normalizeRecipients(input.bcc);

  db.run(
      `UPDATE compose_sessions
     SET from_addr = ?, to_recipients = ?, cc_recipients = ?, bcc_recipients = ?,
         subject = ?, body_text = ?, status = COALESCE(?, status),
         mode = COALESCE(?, mode),
         fixed_recipients = CASE WHEN ? THEN ? ELSE fixed_recipients END,
         thread_id = CASE WHEN ? THEN ? ELSE thread_id END,
         reply_to_message_id = CASE WHEN ? THEN ? ELSE reply_to_message_id END,
         reply_references = CASE WHEN ? THEN ? ELSE reply_references END,
         original_message_id = CASE WHEN ? THEN ? ELSE original_message_id END,
         dirty = ?, last_saved_at = CASE WHEN ? THEN ? ELSE last_saved_at END,
         gmail_draft_id = CASE WHEN ? THEN ? ELSE gmail_draft_id END,
         gmail_message_id = CASE WHEN ? THEN ? ELSE gmail_message_id END,
         updated_at = ?
     WHERE id = ?`,
    [
      from,
      JSON.stringify(to),
      JSON.stringify(cc),
      JSON.stringify(bcc),
      input.subject,
      input.bodyText,
      input.status ?? null,
      input.mode ?? null,
      input.fixedRecipients !== undefined ? 1 : 0,
      input.fixedRecipients ? 1 : 0,
      input.threadId !== undefined ? 1 : 0,
      input.threadId ?? null,
      input.replyToMessageId !== undefined ? 1 : 0,
      input.replyToMessageId ?? null,
      input.replyReferences !== undefined ? 1 : 0,
      JSON.stringify(input.replyReferences ?? []),
      input.originalMessageId !== undefined ? 1 : 0,
      input.originalMessageId ?? null,
      input.dirty === false ? 0 : 1,
      input.lastSavedAt !== undefined ? 1 : 0,
      input.lastSavedAt ?? null,
      input.gmailDraftId !== undefined ? 1 : 0,
      input.gmailDraftId ?? null,
      input.gmailMessageId !== undefined ? 1 : 0,
      input.gmailMessageId ?? null,
      now,
      input.sessionId,
    ],
  );

  if (input.attachments) {
    await persistAttachments(db, input.sessionId, input.attachments);
  }

  const session = await loadSessionById(db, input.sessionId);
  if (!session) {
    throw new Error(`Compose session not found: ${input.sessionId}`);
  }
  return session;
}

async function getPendingSend(db: Database, sendId: string): Promise<PendingSendRow | null> {
  return db
    .query(
      `SELECT id, session_id, account_email, payload_json, status, undo_deadline_at, error
       FROM pending_sends WHERE id = ?`,
    )
    .get(sendId) as PendingSendRow | null;
}

async function markPendingSendStatus(
  db: Database,
  sendId: string,
  status: PendingSendRow["status"],
  fields: { error?: string | null; sentAt?: number | null; cancelledAt?: number | null } = {},
) {
  db.run(
    `UPDATE pending_sends
     SET status = ?, error = ?, sent_at = COALESCE(?, sent_at),
         cancelled_at = COALESCE(?, cancelled_at), updated_at = ?
     WHERE id = ?`,
    [
      status,
      fields.error ?? null,
      fields.sentAt ?? null,
      fields.cancelledAt ?? null,
      Date.now(),
      sendId,
    ],
  );
}

async function buildSendSnapshot(session: ComposeSession, db: Database): Promise<PendingSendSnapshot> {
  const attachmentRows = db
    .query(
      `SELECT id, type, name, mime_type, size, local_path, content_hash, url
       FROM compose_attachments
       WHERE session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(session.id) as ComposeAttachmentRow[];

  return {
    sessionId: session.id,
    mode: session.mode,
    from: session.from,
    to: session.to,
    cc: session.cc,
    bcc: session.bcc,
    subject: session.subject,
    bodyText: appendLinksToBody(session.bodyText, session.attachments),
    bodyHtml: renderRichBodyHtml(appendLinksToBody(session.bodyText, session.attachments)),
    threadId: session.threadId,
    replyToMessageId: session.replyToMessageId,
    replyReferences: session.replyReferences,
    originalMessageId: session.originalMessageId,
    gmailDraftId: session.gmailDraftId,
    attachments: attachmentRows.map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      mimeType: attachment.mime_type ?? undefined,
      size: attachment.size ?? undefined,
      localPath: attachment.local_path,
      url: attachment.url,
    })),
  };
}

async function sendPendingSnapshot(sendId: string) {
  const db = await getDb();
  const pending = await getPendingSend(db, sendId);
  if (!pending || pending.status === "cancelled" || pending.status === "sent") {
    return;
  }

  if (pending.status === "queued" && pending.undo_deadline_at > Date.now()) {
    schedulePendingSend(sendId, pending.undo_deadline_at);
    return;
  }

  await markPendingSendStatus(db, sendId, "sending");

  try {
    const snapshot = JSON.parse(pending.payload_json) as PendingSendSnapshot;
    const attachments = await Promise.all(
      snapshot.attachments
        .filter((attachment) => attachment.type !== "link")
        .map(async (attachment) => {
          if (!attachment.localPath) {
            throw new Error(`Attachment missing local path: ${attachment.name}`);
          }
          return {
            filename: attachment.name,
            mimeType: attachment.mimeType ?? "application/octet-stream",
            dataBase64: (await readFile(attachment.localPath)).toString("base64"),
          };
        }),
    );
    const accessToken = await getValidAccessTokenForEmail(pending.account_email);
    const sent = await sendMessage(accessToken, {
      from: snapshot.from,
      to: snapshot.to,
      cc: snapshot.cc,
      bcc: snapshot.bcc,
      subject: snapshot.subject,
      bodyText: snapshot.bodyText,
      bodyHtml: snapshot.bodyHtml ?? undefined,
      threadId: snapshot.threadId ?? undefined,
      inReplyTo: snapshot.replyToMessageId ?? undefined,
      references: snapshot.replyReferences,
      attachments,
    });

    if (snapshot.gmailDraftId) {
      try {
        await deleteDraft(accessToken, snapshot.gmailDraftId);
      } catch (err) {
        console.warn(`Failed to delete Gmail draft ${snapshot.gmailDraftId}:`, err);
      }
    }

    await markPendingSendStatus(db, sendId, "sent", { sentAt: Date.now() });
    await upsertComposeContacts(
      pending.account_email,
      [...snapshot.to, ...snapshot.cc, ...snapshot.bcc].map((email) => ({ email })),
    );
    await saveSessionState({
      sessionId: snapshot.sessionId,
      from: snapshot.from,
      to: snapshot.to,
      cc: snapshot.cc,
      bcc: snapshot.bcc,
      subject: snapshot.subject,
      bodyText: snapshot.bodyText,
      mode: snapshot.mode,
      fixedRecipients: snapshot.mode !== "compose",
      threadId: snapshot.threadId,
      replyToMessageId: snapshot.replyToMessageId,
      replyReferences: snapshot.replyReferences,
      originalMessageId: snapshot.originalMessageId,
      status: "sent",
      dirty: false,
      gmailDraftId: null,
      gmailMessageId: sent.id,
    });
    await insertMessage({
      id: sent.id,
      threadId: sent.threadId ?? snapshot.threadId ?? snapshot.sessionId,
      historyId: String(Date.now()),
      internalDate: Date.now(),
      from: snapshot.from,
      to: snapshot.to.join(", "),
      subject: snapshot.subject,
      snippet: stripQuotedText(snapshot.bodyText).slice(0, 180),
      bodyText: snapshot.bodyText,
      bodyHtml: snapshot.bodyHtml,
      attachments: snapshot.attachments
        .filter((attachment) => attachment.type !== "link")
        .map((attachment) => ({
          filename: attachment.name,
          mimeType: attachment.mimeType ?? "application/octet-stream",
          size: attachment.size ?? 0,
          attachmentId: attachment.id,
        })),
      category: "regular",
      isRead: true,
      isImportant: false,
      isInbox: false,
      isSent: true,
      isDraft: false,
      isTrash: false,
    });
    emitComposeStatus({
      sessionId: snapshot.sessionId,
      sendId,
      status: "send_sent",
    });
  } catch (err) {
    console.error(`Pending send failed for ${sendId}:`, err);
    const mapped = mapComposeError(err);
    await markPendingSendStatus(db, sendId, "failed", { error: mapped.error });

    const failedSend = await getPendingSend(db, sendId);
    if (failedSend) {
      const snapshot = JSON.parse(failedSend.payload_json) as PendingSendSnapshot;
      await saveSessionState({
        sessionId: snapshot.sessionId,
        from: snapshot.from,
        to: snapshot.to,
        cc: snapshot.cc,
        bcc: snapshot.bcc,
        subject: snapshot.subject,
        bodyText: snapshot.bodyText,
        status: "failed",
        dirty: true,
      });
      emitComposeStatus({
        sessionId: snapshot.sessionId,
        sendId,
        status: "send_failed",
        error: mapped.error,
      });
    }
  }
}

function schedulePendingSend(sendId: string, deadlineAt: number) {
  const existingTimer = sendTimers.get(sendId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delayMs = Math.max(0, deadlineAt - Date.now());
  const timer = setTimeout(() => {
    sendTimers.delete(sendId);
    void sendPendingSnapshot(sendId);
  }, delayMs);
  sendTimers.set(sendId, timer);
}

export async function createComposeSession(
  params: { from: string },
): Promise<RadiusRPC["bun"]["requests"]["createComposeSession"]["response"]> {
  const db = await getDb();
  const from = sanitizeHeaderText(params.from);
  if (!from) {
    return { success: false, error: "Connect a Gmail account before composing." };
  }

  const existing = db
    .query(
      `SELECT id
       FROM compose_sessions
       WHERE account_email = ? AND from_addr = ? AND mode = 'compose' AND status IN ('editing', 'failed')
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(from, from) as { id: string } | null;

  if (existing) {
    const session = await loadSessionById(db, existing.id);
    if (session) {
      return { success: true, session };
    }
  }

  const now = Date.now();
  const sessionId = randomUUID();
  db.run(
    `INSERT INTO compose_sessions
      (id, account_email, from_addr, to_recipients, cc_recipients, bcc_recipients,
       subject, body_text, mode, fixed_recipients, reply_references, status, dirty, created_at, updated_at)
     VALUES (?, ?, ?, '[]', '[]', '[]', '', '', 'compose', 0, '[]', 'editing', 0, ?, ?)`,
    [sessionId, from, from, now, now],
  );

  const session = await loadSessionById(db, sessionId);
  return { success: true, session: session ?? undefined };
}

function parseRecipientEmails(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => {
      const match = entry.match(/<([^>]+)>/);
      return (match?.[1] ?? entry).trim().toLowerCase();
    })
    .filter(Boolean);
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function createReplyForwardSession(
  params: RadiusRPC["bun"]["requests"]["createReplyForwardSession"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["createReplyForwardSession"]["response"]> {
  try {
    const original = await getMessageById(params.messageId);
    if (!original) {
      return { success: false, error: "Original message not found." };
    }

    const db = await getDb();
    const from = sanitizeHeaderText(params.from);
    let messageIdHeader: string | null = null;
    let references: string[] = [];
    let threadId = String(original.threadId ?? "");

    let headers: Record<string, string> | null = null;
    try {
      const accessToken = await getValidAccessTokenForEmail(from);
      const gmailMessage = await getGmailMessage(accessToken, params.messageId);
      headers = parseHeaders(gmailMessage.payload.headers ?? []);
      messageIdHeader = headers["message-id"]?.trim() ?? null;
      references = headers["references"]
        ? headers["references"].split(/\s+/).map((entry) => entry.trim()).filter(Boolean)
        : [];
      if (messageIdHeader && !references.includes(messageIdHeader)) {
        references.push(messageIdHeader);
      }
      threadId = threadId || gmailMessage.threadId;
    } catch (error) {
      console.warn("Reply/forward header lookup failed, continuing with local metadata:", error);
    }

    const originalFrom = String(original.from ?? "");
    const originalTo = String(original.to ?? "");
    const normalizedFrom = from.toLowerCase();
    const forwardCandidates = parseRecipientEmails(originalTo).filter(
      (email) => email !== normalizedFrom && isLikelyEmail(email),
    );
    const replyToHeader = headers?.["reply-to"]?.trim();
    const replyToCandidates = replyToHeader
      ? parseRecipientEmails(replyToHeader).filter(isLikelyEmail)
      : [];
    let replyCandidates =
      replyToCandidates.length > 0
        ? replyToCandidates
        : parseRecipientEmails(originalFrom).filter(isLikelyEmail);
    if (replyCandidates[0]?.toLowerCase() === normalizedFrom) {
      const sentReplyCandidates = parseRecipientEmails(originalTo).filter(isLikelyEmail);
      if (sentReplyCandidates.length > 0) {
        replyCandidates = sentReplyCandidates;
      }
    }
    const recipients =
      params.mode === "reply"
        ? replyCandidates
        : forwardCandidates.length > 0
          ? forwardCandidates
          : replyCandidates;

    if (recipients.length === 0) {
      return { success: false, error: "Couldn't determine a valid recipient for this message." };
    }

    const sessionId = randomUUID();
    const now = Date.now();
    const subject = normalizeSubjectPrefix(
      String(original.subject ?? ""),
      params.mode === "reply" ? "Re" : "Fwd",
    );
    const bodyText =
      params.mode === "reply"
        ? buildReplyQuote({
            from: originalFrom,
            to: originalTo,
            subject: String(original.subject ?? ""),
            internalDate: Number(original.internalDate ?? Date.now()),
            bodyText: (original.bodyText as string | null | undefined) ?? null,
            snippet: String(original.snippet ?? ""),
          })
        : buildForwardBody({
            from: originalFrom,
            to: originalTo,
            subject: String(original.subject ?? ""),
            internalDate: Number(original.internalDate ?? Date.now()),
            bodyText: (original.bodyText as string | null | undefined) ?? null,
            snippet: String(original.snippet ?? ""),
          });

    db.run(
      `INSERT INTO compose_sessions
        (id, account_email, from_addr, to_recipients, cc_recipients, bcc_recipients,
         subject, body_text, mode, fixed_recipients, thread_id, reply_to_message_id,
         reply_references, original_message_id, status, dirty, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, ?, ?, ?, 'editing', 1, ?, ?)`,
      [
        sessionId,
        from,
        from,
        JSON.stringify(recipients),
        subject,
        bodyText,
        params.mode,
        params.mode === "reply" ? 1 : 0,
        threadId || null,
        messageIdHeader,
        JSON.stringify(references),
        params.messageId,
        now,
        now,
      ],
    );

    const session = await loadSessionById(db, sessionId);
    return { success: true, session: session ?? undefined };
  } catch (err) {
    console.error("createReplyForwardSession error:", err);
    return { success: false, error: "Failed to load composer" };
  }
}

export async function updateComposeSession(
  params: RadiusRPC["bun"]["requests"]["updateComposeSession"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["updateComposeSession"]["response"]> {
  try {
    const session = await saveSessionState({
      sessionId: params.sessionId,
      from: params.from,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      bodyText: params.bodyText,
      attachments: params.attachments ?? [],
      status: "editing",
      dirty: true,
    });
    return { success: true, session };
  } catch (err) {
    console.error("updateComposeSession error:", err);
    return { success: false, error: String(err) };
  }
}

export async function saveDraftForSession(
  params: RadiusRPC["bun"]["requests"]["saveDraft"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["saveDraft"]["response"]> {
  const db = await getDb();
  const session = await loadSessionById(db, params.sessionId);
  if (!session) {
    return { success: false, error: "Compose session not found." };
  }

  const validationError = validateSessionForRemote(session);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    const accessToken = await getValidAccessTokenForEmail(session.from);
    const attachments = session.attachments
      .filter((attachment) => attachment.type !== "link")
      .map((attachment) => {
        if (!attachment.dataBase64) {
          throw new Error(`Attachment data missing for ${attachment.name}`);
        }
        return {
          filename: sanitizeFilename(attachment.name),
          mimeType: attachment.mimeType ?? "application/octet-stream",
          dataBase64: attachment.dataBase64,
        };
      });
    const payload = {
      from: session.from,
      to: session.to,
      cc: session.cc,
      bcc: session.bcc,
      subject: session.subject,
      bodyText: appendLinksToBody(session.bodyText, session.attachments),
      bodyHtml: renderRichBodyHtml(appendLinksToBody(session.bodyText, session.attachments)) ?? undefined,
      threadId: session.threadId ?? undefined,
      inReplyTo: session.replyToMessageId ?? undefined,
      references: session.replyReferences,
      attachments,
    };
    const draft = session.gmailDraftId
      ? await updateDraft(accessToken, session.gmailDraftId, payload)
      : await createDraft(accessToken, payload);
    const lastSavedAt = Date.now();
    await saveSessionState({
      sessionId: session.id,
      from: session.from,
      to: session.to,
      cc: session.cc,
      bcc: session.bcc,
      subject: session.subject,
      bodyText: session.bodyText,
      attachments: session.attachments,
      dirty: false,
      lastSavedAt,
      gmailDraftId: draft.id,
      gmailMessageId: draft.message.id,
      status: "editing",
    });
    await upsertComposeContacts(
      session.from,
      [...session.to, ...session.cc, ...session.bcc].map((email) => ({ email })),
    );
    emitComposeStatus({
      sessionId: session.id,
      status: "draft_saved",
    });
    return {
      success: true,
      sessionId: session.id,
      draftId: draft.id,
      messageId: draft.message.id,
      lastSavedAt,
    };
  } catch (err) {
    console.error("saveDraft error:", err);
    const mapped = mapComposeError(err);
    return {
      success: false,
      error: mapped.error,
      code: mapped.code,
    };
  }
}

export async function queueSendForSession(
  params: RadiusRPC["bun"]["requests"]["queueSend"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["queueSend"]["response"]> {
  const db = await getDb();
  const session = await loadSessionById(db, params.sessionId);
  if (!session) {
    return { success: false, error: "Compose session not found." };
  }

  const validationError = validateSessionForRemote(session);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const existingQueued = db
    .query(
      `SELECT id
       FROM pending_sends
       WHERE session_id = ? AND status IN ('queued', 'sending')
       LIMIT 1`,
    )
    .get(session.id) as { id: string } | null;
  if (existingQueued) {
    const pending = await getPendingSend(db, existingQueued.id);
    return {
      success: true,
      sessionId: session.id,
      sendId: pending?.id,
      undoDeadlineAt: pending?.undo_deadline_at,
    };
  }

  const sendId = randomUUID();
  const scheduledForAt = Math.max(
    params.sendAt ?? Date.now() + UNDO_SEND_MS,
    Date.now() + 2_000,
  );
  const snapshot = await buildSendSnapshot(session, db);

  db.run(
    `INSERT INTO pending_sends
      (id, session_id, account_email, payload_json, status, undo_deadline_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`,
    [
      sendId,
      session.id,
      session.from,
      JSON.stringify(snapshot),
      scheduledForAt,
      Date.now(),
      Date.now(),
    ],
  );

  await saveSessionState({
    sessionId: session.id,
    from: session.from,
    to: session.to,
    cc: session.cc,
    bcc: session.bcc,
    subject: session.subject,
    bodyText: session.bodyText,
    attachments: session.attachments,
    status: "queued",
    dirty: false,
  });

  schedulePendingSend(sendId, scheduledForAt);
  emitComposeStatus({
    sessionId: session.id,
    sendId,
    status: "send_queued",
    undoDeadlineAt: scheduledForAt,
    scheduledForAt,
  });

  return {
    success: true,
    sessionId: session.id,
    sendId,
    undoDeadlineAt: scheduledForAt,
    scheduledForAt,
  };
}

export async function undoPendingSend(
  params: RadiusRPC["bun"]["requests"]["undoSend"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["undoSend"]["response"]> {
  const db = await getDb();
  const pending = await getPendingSend(db, params.sendId);
  if (!pending) {
    return { success: false, error: "Queued send not found." };
  }
  if (pending.status !== "queued") {
    return { success: false, sessionId: pending.session_id, error: "This send can no longer be undone." };
  }
  if (pending.undo_deadline_at <= Date.now()) {
    return { success: false, sessionId: pending.session_id, error: "Undo window has expired." };
  }

  const timer = sendTimers.get(params.sendId);
  if (timer) {
    clearTimeout(timer);
    sendTimers.delete(params.sendId);
  }

  await markPendingSendStatus(db, params.sendId, "cancelled", { cancelledAt: Date.now() });
  const session = await loadSessionById(db, pending.session_id);
  if (session) {
    await saveSessionState({
      sessionId: session.id,
      from: session.from,
      to: session.to,
      cc: session.cc,
      bcc: session.bcc,
      subject: session.subject,
      bodyText: session.bodyText,
      attachments: session.attachments,
      status: "editing",
      dirty: true,
    });
  }
  emitComposeStatus({
    sessionId: pending.session_id,
    sendId: params.sendId,
    status: "send_undone",
  });
  return { success: true, sessionId: pending.session_id };
}

export async function discardComposeSession(
  params: RadiusRPC["bun"]["requests"]["discardComposeSession"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["discardComposeSession"]["response"]> {
  const db = await getDb();
  const session = await loadSessionById(db, params.sessionId);
  if (!session) {
    return { success: true };
  }

  if (params.deleteRemoteDraft && session.gmailDraftId) {
    try {
      const accessToken = await getValidAccessTokenForEmail(session.from);
      await deleteDraft(accessToken, session.gmailDraftId);
    } catch (err) {
      console.warn(`Failed to delete remote draft ${session.gmailDraftId}:`, err);
    }
  }

  const attachmentRows = db
    .query(
      `SELECT local_path FROM compose_attachments WHERE session_id = ?`,
    )
    .all(session.id) as Array<{ local_path: string | null }>;
  for (const row of attachmentRows) {
    await deleteFileIfPresent(row.local_path);
  }

  db.run(`DELETE FROM compose_sessions WHERE id = ?`, [session.id]);
  return { success: true };
}

export async function resumePendingSends() {
  const db = await getDb();
  const pendingRows = db
    .query(
      `SELECT id, status, undo_deadline_at
       FROM pending_sends
       WHERE status IN ('queued', 'sending')`,
    )
    .all() as Array<{ id: string; status: string; undo_deadline_at: number }>;

  for (const pending of pendingRows) {
    const deadlinePassed = pending.undo_deadline_at <= Date.now();
    if (pending.status === "sending") {
      // Previous attempt may have completed before crash; avoid duplicate sends.
      await markPendingSendStatus(db, pending.id, "failed", {
        error: "Send interrupted before confirmation. Please retry.",
      });
    } else if (deadlinePassed) {
      void sendPendingSnapshot(pending.id);
    } else {
      // Still within undo window — schedule the timer
      schedulePendingSend(pending.id, pending.undo_deadline_at);
    }
  }
}

export async function clearComposeArtifacts() {
  try {
    await rm(COMPOSE_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors in tests
  }
}

export const __internal = {
  appendLinksToBody,
  hasMeaningfulContent,
  isValidEmail,
  mapComposeError,
  sanitizeFilename,
  sanitizeHeaderText,
  validateSessionForRemote,
};
