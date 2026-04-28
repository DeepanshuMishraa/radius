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
      subject TEXT,
      snippet TEXT,
      body_text TEXT,
      body_html TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(internal_date DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      history_id TEXT,
      last_sync_at INTEGER,
      full_sync_completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'idle'
    );

    INSERT OR IGNORE INTO sync_state (id) VALUES (1);
  `);
}

export async function insertMessage(message: {
  id: string;
  threadId: string;
  historyId: string;
  internalDate: number;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
}): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT OR REPLACE INTO messages
     (id, thread_id, history_id, internal_date, from_addr, subject, snippet, body_text, body_html)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.threadId,
      message.historyId,
      message.internalDate,
      message.from,
      message.subject,
      message.snippet,
      message.bodyText,
      message.bodyHtml,
    ]
  );
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
              internal_date as internalDate, from_addr as \`from\`,
              subject, snippet, body_text as bodyText, body_html as bodyHtml
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
              internal_date as internalDate, from_addr as \`from\`,
              subject, snippet, body_text as bodyText, body_html as bodyHtml
       FROM messages WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | null;
  return row;
}

export async function updateSyncState(state: {
  historyId?: string;
  lastSyncAt?: number;
  fullSyncCompletedAt?: number;
  status?: string;
}): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: (string | number)[] = [];

  if (state.historyId !== undefined) {
    sets.push("history_id = ?");
    vals.push(state.historyId);
  }
  if (state.lastSyncAt !== undefined) {
    sets.push("last_sync_at = ?");
    vals.push(state.lastSyncAt);
  }
  if (state.fullSyncCompletedAt !== undefined) {
    sets.push("full_sync_completed_at = ?");
    vals.push(state.fullSyncCompletedAt);
  }
  if (state.status !== undefined) {
    sets.push("status = ?");
    vals.push(state.status);
  }

  if (sets.length > 0) {
    db.run(`UPDATE sync_state SET ${sets.join(", ")} WHERE id = 1`, vals);
  }
}

export async function getSyncState(): Promise<{
  historyId: string | null;
  lastSyncAt: number | null;
  fullSyncCompletedAt: number | null;
  status: string;
}> {
  const db = await getDb();
  const row = db
    .query("SELECT history_id, last_sync_at, full_sync_completed_at, status FROM sync_state WHERE id = 1")
    .get() as {
    history_id: string | null;
    last_sync_at: number | null;
    full_sync_completed_at: number | null;
    status: string;
  } | null;

  return {
    historyId: row?.history_id ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    fullSyncCompletedAt: row?.full_sync_completed_at ?? null,
    status: row?.status ?? "idle",
  };
}

export async function clearMessages(): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM messages");
}
