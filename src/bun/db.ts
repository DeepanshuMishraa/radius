import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DB_DIR = join(homedir(), "Library", "Application Support", "Radius");
const DB_PATH = join(DB_DIR, "radius.db");

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  await mkdir(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
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
      category TEXT DEFAULT 'regular',
      is_read INTEGER NOT NULL DEFAULT 1,
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
      status TEXT NOT NULL DEFAULT 'idle',
      phase TEXT,
      progress_current INTEGER,
      progress_total INTEGER,
      error TEXT,
      metadata_schema_version INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO sync_state (id) VALUES (1);
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

  const existingColumns = new Set(syncStateColumns.map((column) => column.name));

  if (!existingColumns.has("initial_sync_completed_at")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN initial_sync_completed_at INTEGER");
  }
  if (!existingColumns.has("full_sync_completed_at")) {
    db.exec("ALTER TABLE sync_state ADD COLUMN full_sync_completed_at INTEGER");
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
  category: string;
  isRead: boolean;
}): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT OR REPLACE INTO messages
     (id, thread_id, history_id, internal_date, from_addr, to_addr, subject, snippet, body_text, body_html, category, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      message.category,
      message.isRead ? 1 : 0,
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
    category: string;
    isRead: boolean;
  }>
): Promise<void> {
  const db = await getDb();
  db.exec("BEGIN TRANSACTION");
  try {
    for (const message of messages) {
      db.run(
        `INSERT OR REPLACE INTO messages
         (id, thread_id, history_id, internal_date, from_addr, to_addr, subject, snippet, body_text, body_html, category, is_read)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          message.category,
          message.isRead ? 1 : 0,
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

  const totalRow = db.query("SELECT COUNT(*) as count FROM messages").get() as {
    count: number;
  };

  const rows = db
    .query(
      `SELECT id, thread_id as threadId, history_id as historyId,
              internal_date as internalDate, from_addr as \`from\`, to_addr as \`to\`,
              subject, snippet, category, CAST(COALESCE(is_read, 1) AS INTEGER) as isRead
       FROM messages
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
              subject, snippet, body_text as bodyText, body_html as bodyHtml, category,
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
       FROM messages_fts
       WHERE messages_fts MATCH ?`
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
  fullSyncCompletedAt?: number;
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
              full_sync_completed_at, status, phase, progress_current,
              progress_total, error, metadata_schema_version
       FROM sync_state WHERE id = 1`
    )
    .get() as {
    history_id: string | null;
    last_sync_at: number | null;
    initial_sync_completed_at: number | null;
    full_sync_completed_at: number | null;
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
  }>
): Promise<void> {
  if (messages.length === 0) return;

  const db = await getDb();
  db.exec("BEGIN TRANSACTION");
  try {
    for (const message of messages) {
      db.run(
        `INSERT INTO messages
         (id, thread_id, history_id, internal_date, from_addr, to_addr, subject, snippet, category, is_read)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           thread_id = excluded.thread_id,
           history_id = excluded.history_id,
           internal_date = excluded.internal_date,
           from_addr = excluded.from_addr,
           to_addr = excluded.to_addr,
           subject = excluded.subject,
           snippet = excluded.snippet,
           category = excluded.category,
           is_read = excluded.is_read`,
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
