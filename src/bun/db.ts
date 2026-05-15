import { Database } from "bun:sqlite";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export const APP_SUPPORT_DIR = join(homedir(), "Library", "Application Support", "Radius");
const DEFAULT_DB_PATH = join(APP_SUPPORT_DIR, "radius.db");

let db: Database | null = null;
let currentAccountEmail: string | null = null;

function getDbPath(email: string | null): string {
  if (!email) return DEFAULT_DB_PATH;
  const safeEmail = email.replace(/[^a-zA-Z0-9.@]/g, "_");
  return join(APP_SUPPORT_DIR, `radius-${safeEmail}.db`);
}

export function getDbPathForEmail(email: string | null): string {
  return getDbPath(email);
}

export function getCurrentAccountEmail(): string | null {
  return currentAccountEmail;
}

export async function switchAccount(email: string | null): Promise<void> {
  if (currentAccountEmail === email && db) return;

  if (db) {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
    db = null;
  }

  currentAccountEmail = email;
  await createSchema();
}

export async function deleteAccountDb(email: string): Promise<void> {
  const safeEmail = email.replace(/[^a-zA-Z0-9.@]/g, "_");
  const dbPath = join(APP_SUPPORT_DIR, `radius-${safeEmail}.db`);

  if (currentAccountEmail === email && db) {
    try {
      db.close();
    } catch {
    }
    db = null;
    currentAccountEmail = null;
  }

  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const file of files) {
    try {
      await unlink(file);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Failed to delete ${file}:`, err);
      }
    }
  }
}

export async function getDb(): Promise<Database> {
  if (db) return db;

  await mkdir(APP_SUPPORT_DIR, { recursive: true });

  const dbPath = getDbPath(currentAccountEmail);
  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  return db;
}

export async function createSchema(): Promise<void> {
  const db = await getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      history_id TEXT NOT NULL,
      internal_date INTEGER NOT NULL,
      from_addr TEXT,
      to_addr TEXT,
      subject TEXT,
      snippet TEXT,
      body_text TEXT,
      body_html TEXT,
      attachments TEXT,
      category TEXT DEFAULT 'regular',
      is_read INTEGER NOT NULL DEFAULT 1,
      is_inbox INTEGER NOT NULL DEFAULT 0,
      is_sent INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      is_trash INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(internal_date DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      id UNINDEXED,
      from_addr,
      to_addr,
      subject,
      snippet,
      body_text
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      history_id TEXT,
      last_sync_at INTEGER,
      initial_sync_completed_at INTEGER,
      full_sync_completed_at INTEGER,
      sync_mode TEXT NOT NULL DEFAULT 'recent',
      background_sync_cursor TEXT,
      background_sync_total INTEGER,
      background_sync_processed INTEGER NOT NULL DEFAULT 0,
      background_sync_pending INTEGER NOT NULL DEFAULT 0,
      background_sync_last_batch_at INTEGER,
      status TEXT NOT NULL DEFAULT 'idle',
      phase TEXT,
      progress_current INTEGER,
      progress_total INTEGER,
      error TEXT,
      metadata_schema_version INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO sync_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS compose_sessions (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      from_addr TEXT NOT NULL,
      to_recipients TEXT NOT NULL DEFAULT '[]',
      cc_recipients TEXT NOT NULL DEFAULT '[]',
      bcc_recipients TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      gmail_draft_id TEXT,
      gmail_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'editing',
      dirty INTEGER NOT NULL DEFAULT 1,
      last_saved_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compose_sessions_account_updated
      ON compose_sessions(account_email, updated_at DESC);

    CREATE TABLE IF NOT EXISTS compose_attachments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES compose_sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      local_path TEXT,
      content_hash TEXT,
      url TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compose_attachments_session
      ON compose_attachments(session_id);

    CREATE TABLE IF NOT EXISTS pending_sends (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES compose_sessions(id) ON DELETE CASCADE,
      account_email TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      undo_deadline_at INTEGER NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER,
      cancelled_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pending_sends_status_deadline
      ON pending_sends(status, undo_deadline_at);

    CREATE TABLE IF NOT EXISTS compose_contacts (
      account_email TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      frequency INTEGER NOT NULL DEFAULT 1,
      last_used_at INTEGER NOT NULL,
      PRIMARY KEY (account_email, email)
    );

    CREATE INDEX IF NOT EXISTS idx_compose_contacts_rank
      ON compose_contacts(account_email, frequency DESC, last_used_at DESC);

    CREATE TABLE IF NOT EXISTS sender_avatars (
      domain TEXT PRIMARY KEY,
      avatar_url TEXT,
      fetched_at INTEGER NOT NULL
    );
  `);

  const syncStateColumns = db.query(
    `SELECT name FROM pragma_table_info('sync_state')`
  ).all() as Array<{ name: string }>;

  const messageColumns = db.query(
    `SELECT name FROM pragma_table_info('messages')`
  ).all() as Array<{ name: string }>;
  const existingMessageColumns = new Set(messageColumns.map((c) => c.name));
  if (!existingMessageColumns.has("to_addr")) {
    db.exec("ALTER TABLE messages ADD COLUMN to_addr TEXT");
  }
  if (!existingMessageColumns.has("category")) {
    db.exec("ALTER TABLE messages ADD COLUMN category TEXT DEFAULT 'regular'");
  }
  if (!existingMessageColumns.has("is_read")) {
    db.exec("ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 1");
  }
  if (!existingMessageColumns.has("attachments")) {
    db.exec("ALTER TABLE messages ADD COLUMN attachments TEXT");
  }
  if (!existingMessageColumns.has("is_inbox")) {
    db.exec("ALTER TABLE messages ADD COLUMN is_inbox INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingMessageColumns.has("is_sent")) {
    db.exec("ALTER TABLE messages ADD COLUMN is_sent INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingMessageColumns.has("is_draft")) {
    db.exec("ALTER TABLE messages ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingMessageColumns.has("is_trash")) {
    db.exec("ALTER TABLE messages ADD COLUMN is_trash INTEGER NOT NULL DEFAULT 0");
  }

  const existingColumns = new Set(syncStateColumns.map((column) => column.name));

  if (!existingColumns.has("initial_sync_completed_at")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN initial_sync_completed_at INTEGER");
  }
  if (!existingColumns.has("full_sync_completed_at")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN full_sync_completed_at INTEGER");
  }
  if (!existingColumns.has("sync_mode")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'recent'");
  }
  if (!existingColumns.has("background_sync_cursor")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN background_sync_cursor TEXT");
  }
  if (!existingColumns.has("background_sync_total")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN background_sync_total INTEGER");
  }
  if (!existingColumns.has("background_sync_processed")) {
    db.exec(
      "ALTER TABLE sync_state ADD COLUMN background_sync_processed INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!existingColumns.has("background_sync_pending")) {
    db.exec(
      "ALTER TABLE sync_state ADD COLUMN background_sync_pending INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!existingColumns.has("background_sync_last_batch_at")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN background_sync_last_batch_at INTEGER");
  }
  if (!existingColumns.has("phase")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN phase TEXT");
  }
  if (!existingColumns.has("progress_current")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN progress_current INTEGER");
  }
  if (!existingColumns.has("progress_total")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN progress_total INTEGER");
  }
  if (!existingColumns.has("error")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN error TEXT");
  }
  if (!existingColumns.has("metadata_schema_version")) {
    db.exec(
      "ALTER TABLE sync_state ADD COLUMN metadata_schema_version INTEGER NOT NULL DEFAULT 0"
    );
  }

  const messageCountRow = db.query("SELECT COUNT(*) as count FROM messages").get() as {
    count: number;
  };
  const ftsCountRow = db.query("SELECT COUNT(*) as count FROM messages_fts").get() as {
    count: number;
  };

  if (ftsCountRow.count !== messageCountRow.count) {
    db.exec("DELETE FROM messages_fts");
    db.exec(`
      INSERT INTO messages_fts (id, from_addr, to_addr, subject, snippet, body_text)
      SELECT id, COALESCE(from_addr, ''), COALESCE(to_addr, ''), COALESCE(subject, ''),
             COALESCE(snippet, ''), COALESCE(body_text, '')
      FROM messages
    `);
  }

  // Reset any stale 'syncing' state from a previous crashed run
  db.run("UPDATE sync_state SET status = 'idle', phase = NULL, progress_current = NULL, progress_total = NULL WHERE status = 'syncing'");
}

function upsertMessageSearchIndex(db: Database, id: string) {
  db.run("DELETE FROM messages_fts WHERE id = ?", [id]);
  db.run(
    `INSERT INTO messages_fts (id, from_addr, to_addr, subject, snippet, body_text)
     SELECT id, COALESCE(from_addr, ''), COALESCE(to_addr, ''), COALESCE(subject, ''),
            COALESCE(snippet, ''), COALESCE(body_text, '')
     FROM messages
     WHERE id = ?`,
    [id]
  );
}

function buildFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""'))
    .filter(Boolean)
    .map((token) => `"${token}"*`)
    .join(" AND ");
}

export async function insertMessage(message: {
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
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
  category: string;
  isRead: boolean;
  isInbox: boolean;
  isSent: boolean;
  isDraft: boolean;
  isTrash: boolean;
}): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT OR REPLACE INTO messages
     (id, thread_id, history_id, internal_date, from_addr, to_addr, subject, snippet, body_text, body_html, attachments, category, is_read, is_inbox, is_sent, is_draft, is_trash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.threadId,
      message.historyId,
      message.internalDate,
      message.from,
      message.to,
      message.subject,
      message.snippet,
      message.bodyText,
      message.bodyHtml,
      message.attachments.length > 0 ? JSON.stringify(message.attachments) : null,
      message.category,
      message.isRead ? 1 : 0,
      message.isInbox ? 1 : 0,
      message.isSent ? 1 : 0,
      message.isDraft ? 1 : 0,
      message.isTrash ? 1 : 0,
    ]
  );
  upsertMessageSearchIndex(db, message.id);
}

export async function insertMessages(
  messages: Array<{
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
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
  category: string;
  isRead: boolean;
  isInbox: boolean;
  isSent: boolean;
  isDraft: boolean;
  isTrash: boolean;
  }>
): Promise<void> {
  const db = await getDb();
  db.exec("BEGIN TRANSACTION");
  try {
    for (const message of messages) {
      db.run(
        `INSERT OR REPLACE INTO messages
         (id, thread_id, history_id, internal_date, from_addr, to_addr, subject, snippet, body_text, body_html, attachments, category, is_read, is_inbox, is_sent, is_draft, is_trash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          message.threadId,
          message.historyId,
          message.internalDate,
          message.from,
          message.to,
          message.subject,
          message.snippet,
          message.bodyText,
          message.bodyHtml,
          message.attachments.length > 0 ? JSON.stringify(message.attachments) : null,
          message.category,
          message.isRead ? 1 : 0,
          message.isInbox ? 1 : 0,
          message.isSent ? 1 : 0,
          message.isDraft ? 1 : 0,
          message.isTrash ? 1 : 0,
        ]
      );
      upsertMessageSearchIndex(db, message.id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export async function getInboxMessages(
  limit: number,
  offset: number
): Promise<{ messages: Array<Record<string, unknown>>; total: number }> {
  const db = await getDb();

  const totalRow = db.query("SELECT COUNT(*) as count FROM messages WHERE is_inbox = 1").get() as {
    count: number;
  };

  const rows = db
    .query(
      `SELECT id, thread_id as threadId, history_id as historyId,
              internal_date as internalDate, from_addr as \`from\`, to_addr as \`to\`,
              subject, snippet, category, CAST(COALESCE(is_read, 1) AS INTEGER) as isRead
       FROM messages
       WHERE is_inbox = 1
       ORDER BY internal_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Array<Record<string, unknown>>;

  return { messages: rows, total: totalRow.count };
}

export async function getMessageById(
  id: string
): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = db
    .query(
      `SELECT id, thread_id as threadId, history_id as historyId,
              internal_date as internalDate, from_addr as \`from\`, to_addr as \`to\`,
              subject, snippet, body_text as bodyText, body_html as bodyHtml,
              attachments, category,
              CAST(COALESCE(is_read, 1) AS INTEGER) as isRead
       FROM messages WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | null;
  return row;
}

export async function searchInboxMessages(
  query: string,
  limit: number,
  offset: number
): Promise<{ messages: Array<Record<string, unknown>>; total: number }> {
  const db = await getDb();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return getInboxMessages(limit, offset);
  }

  const ftsQuery = buildFtsQuery(trimmedQuery);

  const totalRow = db
    .query(
      `SELECT COUNT(*) as count
       FROM messages_fts f
       JOIN messages m ON m.id = f.id
       WHERE messages_fts MATCH ?
         AND m.is_inbox = 1`
    )
    .get(ftsQuery) as { count: number };

  const rows = db
    .query(
      `SELECT m.id,
              m.thread_id as threadId,
              m.history_id as historyId,
              m.internal_date as internalDate,
              m.from_addr as \`from\`,
              m.to_addr as \`to\`,
              m.subject,
              m.snippet,
              m.category,
              CAST(COALESCE(m.is_read, 1) AS INTEGER) as isRead
       FROM messages_fts f
       JOIN messages m ON m.id = f.id
       WHERE messages_fts MATCH ?
         AND m.is_inbox = 1
       ORDER BY bm25(messages_fts), m.internal_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(ftsQuery, limit, offset) as Array<Record<string, unknown>>;

  return { messages: rows, total: totalRow.count };
}

export async function updateSyncState(state: {
  historyId?: string;
  lastSyncAt?: number;
  initialSyncCompletedAt?: number | null;
  fullSyncCompletedAt?: number | null;
  syncMode?: string;
  backgroundSyncCursor?: string | null;
  backgroundSyncTotal?: number | null;
  backgroundSyncProcessed?: number;
  backgroundSyncPending?: boolean;
  backgroundSyncLastBatchAt?: number | null;
  status?: string;
  phase?: string | null;
  progressCurrent?: number | null;
  progressTotal?: number | null;
  error?: string | null;
  metadataSchemaVersion?: number;
}): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (state.historyId !== undefined) {
    sets.push("history_id = ?");
    vals.push(state.historyId);
  }
  if (state.lastSyncAt !== undefined) {
    sets.push("last_sync_at = ?");
    vals.push(state.lastSyncAt);
  }
  if (state.initialSyncCompletedAt !== undefined) {
    sets.push("initial_sync_completed_at = ?");
    vals.push(state.initialSyncCompletedAt);
  }
  if (state.fullSyncCompletedAt !== undefined) {
    sets.push("full_sync_completed_at = ?");
    vals.push(state.fullSyncCompletedAt);
  }
  if (state.syncMode !== undefined) {
    sets.push("sync_mode = ?");
    vals.push(state.syncMode);
  }
  if (state.backgroundSyncCursor !== undefined) {
    sets.push("background_sync_cursor = ?");
    vals.push(state.backgroundSyncCursor);
  }
  if (state.backgroundSyncTotal !== undefined) {
    sets.push("background_sync_total = ?");
    vals.push(state.backgroundSyncTotal);
  }
  if (state.backgroundSyncProcessed !== undefined) {
    sets.push("background_sync_processed = ?");
    vals.push(state.backgroundSyncProcessed);
  }
  if (state.backgroundSyncPending !== undefined) {
    sets.push("background_sync_pending = ?");
    vals.push(state.backgroundSyncPending ? 1 : 0);
  }
  if (state.backgroundSyncLastBatchAt !== undefined) {
    sets.push("background_sync_last_batch_at = ?");
    vals.push(state.backgroundSyncLastBatchAt);
  }
  if (state.status !== undefined) {
    sets.push("status = ?");
    vals.push(state.status);
  }
  if (state.phase !== undefined) {
    sets.push("phase = ?");
    vals.push(state.phase);
  }
  if (state.progressCurrent !== undefined) {
    sets.push("progress_current = ?");
    vals.push(state.progressCurrent);
  }
  if (state.progressTotal !== undefined) {
    sets.push("progress_total = ?");
    vals.push(state.progressTotal);
  }
  if (state.error !== undefined) {
    sets.push("error = ?");
    vals.push(state.error);
  }
  if (state.metadataSchemaVersion !== undefined) {
    sets.push("metadata_schema_version = ?");
    vals.push(state.metadataSchemaVersion);
  }

  if (sets.length > 0) {
    db.run(`UPDATE sync_state SET ${sets.join(", ")} WHERE id = 1`, vals);
  }
}

export async function getSyncState(): Promise<{
  historyId: string | null;
  lastSyncAt: number | null;
  initialSyncCompletedAt: number | null;
  fullSyncCompletedAt: number | null;
  syncMode: string;
  backgroundSyncCursor: string | null;
  backgroundSyncTotal: number | null;
  backgroundSyncProcessed: number;
  backgroundSyncPending: boolean;
  backgroundSyncLastBatchAt: number | null;
  status: string;
  phase: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  error: string | null;
  metadataSchemaVersion: number;
}> {
  const db = await getDb();
  const row = db
    .query(
      `SELECT history_id, last_sync_at, initial_sync_completed_at,
              full_sync_completed_at, sync_mode, background_sync_cursor,
              background_sync_total, background_sync_processed,
              background_sync_pending, background_sync_last_batch_at,
              status, phase, progress_current, progress_total, error,
              metadata_schema_version
       FROM sync_state WHERE id = 1`
    )
    .get() as {
    history_id: string | null;
    last_sync_at: number | null;
    initial_sync_completed_at: number | null;
    full_sync_completed_at: number | null;
    sync_mode: string | null;
    background_sync_cursor: string | null;
    background_sync_total: number | null;
    background_sync_processed: number | null;
    background_sync_pending: number | null;
    background_sync_last_batch_at: number | null;
    status: string;
    phase: string | null;
    progress_current: number | null;
    progress_total: number | null;
    error: string | null;
    metadata_schema_version: number | null;
  } | null;

  return {
    historyId: row?.history_id ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    initialSyncCompletedAt: row?.initial_sync_completed_at ?? null,
    fullSyncCompletedAt: row?.full_sync_completed_at ?? null,
    syncMode: row?.sync_mode ?? "recent",
    backgroundSyncCursor: row?.background_sync_cursor ?? null,
    backgroundSyncTotal: row?.background_sync_total ?? null,
    backgroundSyncProcessed: row?.background_sync_processed ?? 0,
    backgroundSyncPending: Boolean(row?.background_sync_pending ?? 0),
    backgroundSyncLastBatchAt: row?.background_sync_last_batch_at ?? null,
    status: row?.status ?? "idle",
    phase: row?.phase ?? null,
    progressCurrent: row?.progress_current ?? null,
    progressTotal: row?.progress_total ?? null,
    error: row?.error ?? null,
    metadataSchemaVersion: row?.metadata_schema_version ?? 0,
  };
}

export async function upsertMessageMetadata(
  messages: Array<{
    id: string;
    threadId: string;
    historyId: string;
    internalDate: number;
    from: string;
    to: string;
    subject: string;
    snippet: string;
    category: string;
    isRead: boolean;
    isInbox: boolean;
    isSent: boolean;
    isDraft: boolean;
    isTrash: boolean;
  }>
): Promise<void> {
  if (messages.length === 0) return;

  const db = await getDb();
  db.exec("BEGIN TRANSACTION");
  try {
    for (const message of messages) {
      db.run(
        `INSERT INTO messages
         (id, thread_id, history_id, internal_date, from_addr, to_addr, subject, snippet, category, is_read, is_inbox, is_sent, is_draft, is_trash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           thread_id = excluded.thread_id,
           history_id = excluded.history_id,
           internal_date = excluded.internal_date,
           from_addr = excluded.from_addr,
           to_addr = excluded.to_addr,
           subject = excluded.subject,
           snippet = excluded.snippet,
           category = excluded.category,
           is_read = excluded.is_read,
           is_inbox = excluded.is_inbox,
           is_sent = excluded.is_sent,
           is_draft = excluded.is_draft,
           is_trash = excluded.is_trash`,
        [
          message.id,
          message.threadId,
          message.historyId,
          message.internalDate,
          message.from,
          message.to,
          message.subject,
          message.snippet,
          message.category,
          message.isRead ? 1 : 0,
          message.isInbox ? 1 : 0,
          message.isSent ? 1 : 0,
          message.isDraft ? 1 : 0,
          message.isTrash ? 1 : 0,
        ]
      );
      upsertMessageSearchIndex(db, message.id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export async function setMessageReadState(
  id: string,
  isRead: boolean
): Promise<void> {
  const db = await getDb();
  db.run(`UPDATE messages SET is_read = ? WHERE id = ?`, [isRead ? 1 : 0, id]);
}

export async function listMessageIds(
  limit: number,
  offset: number
): Promise<string[]> {
  const db = await getDb();
  return (db
    .query(
      `SELECT id
       FROM messages
       ORDER BY internal_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Array<{ id: string }>).map((row) => row.id);
}

export async function getMessageCount(): Promise<number> {
  const db = await getDb();
  const row = db.query("SELECT COUNT(*) as count FROM messages").get() as {
    count: number;
  };
  return row.count;
}

export async function getMailboxMessages(
  mailbox: "sent" | "drafts" | "trash",
  limit: number,
  offset: number = 0,
): Promise<{ messages: Array<Record<string, unknown>>; total: number }> {
  const db = await getDb();
  const column =
    mailbox === "sent"
      ? "is_sent"
      : mailbox === "drafts"
        ? "is_draft"
        : "is_trash";

  const totalRow = db.query(`SELECT COUNT(*) as count FROM messages WHERE ${column} = 1`).get() as {
    count: number;
  };

  const rows = db
    .query(
      `SELECT id, thread_id as threadId, history_id as historyId,
              internal_date as internalDate, from_addr as \`from\`, to_addr as \`to\`,
              subject, snippet, category, CAST(COALESCE(is_read, 1) AS INTEGER) as isRead
       FROM messages
       WHERE ${column} = 1
       ORDER BY internal_date DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as Array<Record<string, unknown>>;

  return { messages: rows, total: totalRow.count };
}

export async function updateMessageBodies(
  id: string,
  bodyText: string | null,
  bodyHtml: string | null
): Promise<void> {
  const db = await getDb();
  db.run(
    `UPDATE messages SET body_text = ?, body_html = ? WHERE id = ?`,
    [bodyText, bodyHtml, id]
  );
  upsertMessageSearchIndex(db, id);
}

export async function clearMessages(): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM messages");
  db.run("DELETE FROM messages_fts");
}

export async function resetSyncState(): Promise<void> {
  const db = await getDb();
  db.run(`UPDATE sync_state SET
    history_id = NULL,
    last_sync_at = NULL,
    initial_sync_completed_at = NULL,
    full_sync_completed_at = NULL,
    background_sync_cursor = NULL,
    background_sync_total = NULL,
    background_sync_processed = 0,
    background_sync_pending = 0,
    background_sync_last_batch_at = NULL,
    status = 'idle',
    phase = NULL,
    progress_current = NULL,
    progress_total = NULL,
    error = NULL
  WHERE id = 1`);
}

export async function getComposeContactRows(): Promise<
  Array<{ fromAddr: string | null; toAddr: string | null }>
> {
  const db = await getDb();
  return db
    .query(
      `SELECT from_addr as fromAddr, to_addr as toAddr
       FROM messages
       ORDER BY internal_date DESC
       LIMIT 500`,
    )
    .all() as Array<{ fromAddr: string | null; toAddr: string | null }>;
}

export async function getComposeSessionRecipientRows(): Promise<
  Array<{ toRecipients: string; ccRecipients: string; bccRecipients: string }>
> {
  const db = await getDb();
  return db
    .query(
      `SELECT to_recipients as toRecipients,
              cc_recipients as ccRecipients,
              bcc_recipients as bccRecipients
       FROM compose_sessions
       ORDER BY updated_at DESC
       LIMIT 200`,
    )
    .all() as Array<{ toRecipients: string; ccRecipients: string; bccRecipients: string }>;
}

export async function upsertComposeContacts(
  accountEmail: string,
  contacts: Array<{ email: string; name?: string }>,
): Promise<void> {
  if (contacts.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  db.exec("BEGIN TRANSACTION");
  try {
    for (const contact of contacts) {
      const email = contact.email.trim().toLowerCase();
      if (!email) continue;
      const name = (contact.name?.trim() || email).slice(0, 255);
      db.run(
        `INSERT INTO compose_contacts (account_email, email, name, frequency, last_used_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(account_email, email) DO UPDATE SET
           name = CASE
             WHEN excluded.name != excluded.email THEN excluded.name
             ELSE compose_contacts.name
           END,
           frequency = compose_contacts.frequency + 1,
           last_used_at = excluded.last_used_at`,
        [accountEmail, email, name, now],
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export async function searchComposeContacts(
  accountEmail: string,
  query: string,
  limit: number,
): Promise<Array<{ email: string; name: string; frequency: number }>> {
  const db = await getDb();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return db
      .query(
        `SELECT email, name, frequency
         FROM compose_contacts
         WHERE account_email = ?
         ORDER BY frequency DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(accountEmail, limit) as Array<{ email: string; name: string; frequency: number }>;
  }

  const like = `%${trimmed}%`;
  return db
    .query(
      `SELECT email, name, frequency
       FROM compose_contacts
       WHERE account_email = ?
         AND (lower(email) LIKE ? OR lower(name) LIKE ?)
       ORDER BY
         CASE
           WHEN lower(email) = ? THEN 0
           WHEN lower(name) = ? THEN 1
           WHEN lower(email) LIKE ? THEN 2
           WHEN lower(name) LIKE ? THEN 3
           ELSE 4
         END,
         frequency DESC,
         last_used_at DESC
       LIMIT ?`,
    )
    .all(accountEmail, like, like, trimmed, trimmed, `${trimmed}%`, `${trimmed}%`, limit) as Array<{
      email: string;
      name: string;
      frequency: number;
    }>;
}

export async function getSenderAvatarsBatch(
  domains: string[]
): Promise<Record<string, string | null>> {
  if (domains.length === 0) return {};
  const db = await getDb();
  const result: Record<string, string | null> = {};
  const placeholders = domains.map(() => "?").join(", ");
  const rows = db
    .query(`SELECT domain, avatar_url FROM sender_avatars WHERE domain IN (${placeholders})`)
    .all(...domains) as Array<{ domain: string; avatar_url: string | null }>;
  for (const row of rows) {
    result[row.domain] = row.avatar_url;
  }
  return result;
}

export async function getAllSenderAvatars(): Promise<Record<string, string | null>> {
  const db = await getDb();
  const rows = db
    .query("SELECT domain, avatar_url FROM sender_avatars")
    .all() as Array<{ domain: string; avatar_url: string | null }>;
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.domain] = row.avatar_url;
  }
  return result;
}

export async function upsertSenderAvatar(
  domain: string,
  avatarUrl: string | null
): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT INTO sender_avatars (domain, avatar_url, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET avatar_url = excluded.avatar_url, fetched_at = excluded.fetched_at`,
    [domain, avatarUrl, Math.floor(Date.now() / 1000)]
  );
}
