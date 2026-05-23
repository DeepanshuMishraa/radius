import { randomUUID } from "node:crypto";
import type { PendingDeleteStatusMessage, RadiusRPC } from "../shared/types";
import { getAccountEmail, getValidAccessToken, getValidAccessTokenForEmail } from "./auth";
import {
  getDb,
  getMessageById,
  getThreadMessages as getStoredThreadMessages,
  removeMessages,
  updateMessageMailboxState,
} from "./db";
import { deleteMessage as gmailDeleteMessage, GmailAPIError, trashMessage as gmailTrashMessage } from "./gmail";
import { getProvider } from "./provider";

const UNDO_DELETE_MS = 10_000;

type PendingDeleteRow = {
  id: string;
  message_id: string;
  account_email: string;
  snapshot_json: string;
  status: "queued" | "committed" | "cancelled" | "failed";
  undo_deadline_at: number;
  error: string | null;
};

type PendingDeleteSnapshot = {
  messageId: string;
  isInbox: boolean;
  isSent: boolean;
  isDraft: boolean;
  isTrash: boolean;
};

const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
let emitPendingDeleteStatus: (message: PendingDeleteStatusMessage) => void = () => {};

export function setEmitPendingDeleteStatus(fn: (message: PendingDeleteStatusMessage) => void) {
  emitPendingDeleteStatus = fn;
}

function mapDeleteError(err: unknown): string {
  if (
    err instanceof GmailAPIError &&
    err.status === 403 &&
    err.body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
  ) {
    return "Required Gmail delete permission is missing. Reconnect Gmail and try again.";
  }
  if (err instanceof GmailAPIError && err.isAuthError()) {
    return "Gmail authentication expired. Reconnect Gmail and try again.";
  }
  return String(err);
}

async function getPendingDelete(operationId: string): Promise<PendingDeleteRow | null> {
  const db = await getDb();
  return db
    .query(
      `SELECT id, message_id, account_email, snapshot_json, status, undo_deadline_at, error
       FROM pending_message_deletes
       WHERE id = ?`,
    )
    .get(operationId) as PendingDeleteRow | null;
}

async function markPendingDeleteStatus(
  operationId: string,
  status: PendingDeleteRow["status"],
  fields: { error?: string | null; deletedAt?: number | null; cancelledAt?: number | null } = {},
) {
  const db = await getDb();
  db.run(
    `UPDATE pending_message_deletes
     SET status = ?, error = ?, deleted_at = COALESCE(?, deleted_at),
         cancelled_at = COALESCE(?, cancelled_at), updated_at = ?
     WHERE id = ?`,
    [
      status,
      fields.error ?? null,
      fields.deletedAt ?? null,
      fields.cancelledAt ?? null,
      Date.now(),
      operationId,
    ],
  );
}

async function commitPendingDelete(operationId: string) {
  const pending = await getPendingDelete(operationId);
  if (!pending || pending.status === "cancelled" || pending.status === "committed") {
    return;
  }
  if (pending.undo_deadline_at > Date.now()) {
    schedulePendingDelete(operationId, pending.undo_deadline_at);
    return;
  }

  try {
    const provider = getProvider(pending.account_email);
    if (provider) {
      await provider.trashMessage(pending.message_id);
    } else {
      const accessToken = await getValidAccessTokenForEmail(pending.account_email);
      await gmailTrashMessage(accessToken, pending.message_id);
    }
    await markPendingDeleteStatus(operationId, "committed", { deletedAt: Date.now() });
    emitPendingDeleteStatus({
      operationId,
      messageId: pending.message_id,
      status: "delete_committed",
    });
  } catch (err) {
    const error = mapDeleteError(err);
    await markPendingDeleteStatus(operationId, "failed", { error });
    emitPendingDeleteStatus({
      operationId,
      messageId: pending.message_id,
      status: "delete_failed",
      error,
    });
  } finally {
    const cleanupDb = await getDb();
    cleanupDb.run("DELETE FROM pending_message_deletes WHERE id = ?", [operationId]);
  }
}

async function cancelPendingDelete(messageId: string): Promise<void> {
  const db = await getDb();
  const pending = db
    .query(
      `SELECT id FROM pending_message_deletes
       WHERE message_id = ? AND status = 'queued'`,
    )
    .all(messageId) as Array<{ id: string }>;
  for (const row of pending) {
    const timer = deleteTimers.get(row.id);
    if (timer) {
      clearTimeout(timer);
      deleteTimers.delete(row.id);
    }
    await markPendingDeleteStatus(row.id, "cancelled", { cancelledAt: Date.now() });
    db.run("DELETE FROM pending_message_deletes WHERE id = ?", [row.id]);
  }
}

function schedulePendingDelete(operationId: string, deadlineAt: number) {
  const existing = deleteTimers.get(operationId);
  if (existing) clearTimeout(existing);
  const delayMs = Math.max(0, deadlineAt - Date.now());
  const timer = setTimeout(() => {
    deleteTimers.delete(operationId);
    void commitPendingDelete(operationId);
  }, delayMs);
  deleteTimers.set(operationId, timer);
}

export async function handleGetThreadMessages(params: {
  threadId: string;
  limit?: number;
}): Promise<RadiusRPC["bun"]["requests"]["getThreadMessages"]["response"]> {
  const rows = await getStoredThreadMessages(params.threadId, Math.min(params.limit ?? 12, 40));
  return {
    messages: rows.map((row) => {
      let attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = [];
      if (typeof row.attachments === "string" && row.attachments) {
        try {
          attachments = JSON.parse(row.attachments);
        } catch {
          attachments = [];
        }
      }
      return {
        ...row,
        attachments,
        category: typeof row.category === "string" ? row.category : "regular",
        isRead: Boolean(row.isRead),
      };
    }) as RadiusRPC["bun"]["requests"]["getThreadMessages"]["response"]["messages"],
  };
}

export async function queueDeleteMessage(
  params: RadiusRPC["bun"]["requests"]["queueDeleteMessage"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["queueDeleteMessage"]["response"]> {
  const message = await getMessageById(params.messageId);
  if (!message) {
    return { success: false, error: "Message not found." };
  }

  if (Boolean(message.isTrash)) {
    try {
      await cancelPendingDelete(params.messageId);
      const provider = getProvider(getAccountEmail() ?? "");
      if (provider) {
        await provider.deleteMessage(params.messageId);
      } else {
        const accessToken = await getValidAccessToken();
        await gmailDeleteMessage(accessToken, params.messageId);
      }
      await removeMessages([params.messageId]);
      return { success: true };
    } catch (err) {
      return { success: false, error: mapDeleteError(err) };
    }
  }

  const snapshot: PendingDeleteSnapshot = {
    messageId: params.messageId,
    isInbox: Boolean(message.isInbox),
    isSent: Boolean(message.isSent),
    isDraft: Boolean(message.isDraft),
    isTrash: Boolean(message.isTrash),
  };
  const operationId = randomUUID();
  const undoDeadlineAt = Date.now() + UNDO_DELETE_MS;
  const accountEmail = getAccountEmail();
  if (!accountEmail) {
    return { success: false, error: "No active account found." };
  }
  const db = await getDb();
  db.exec("BEGIN TRANSACTION");
  try {
    db.run(
      `INSERT INTO pending_message_deletes
        (id, message_id, account_email, snapshot_json, status, undo_deadline_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`,
      [
        operationId,
        params.messageId,
        accountEmail,
        JSON.stringify(snapshot),
        undoDeadlineAt,
        Date.now(),
        Date.now(),
      ],
    );

    await updateMessageMailboxState(params.messageId, {
      isInbox: false,
      isSent: false,
      isDraft: false,
      isTrash: true,
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  schedulePendingDelete(operationId, undoDeadlineAt);
  emitPendingDeleteStatus({
    operationId,
    messageId: params.messageId,
    status: "delete_queued",
    undoDeadlineAt,
  });
  return { success: true, operationId, undoDeadlineAt };
}

export async function undoDeleteMessage(
  params: RadiusRPC["bun"]["requests"]["undoDeleteMessage"]["params"],
): Promise<RadiusRPC["bun"]["requests"]["undoDeleteMessage"]["response"]> {
  const pending = await getPendingDelete(params.operationId);
  if (!pending) {
    return { success: false, error: "Delete action not found." };
  }
  if (pending.status !== "queued" || pending.undo_deadline_at <= Date.now()) {
    return { success: false, error: "Undo window has expired." };
  }

  const timer = deleteTimers.get(params.operationId);
  if (timer) {
    clearTimeout(timer);
    deleteTimers.delete(params.operationId);
  }

  const snapshot = JSON.parse(pending.snapshot_json) as PendingDeleteSnapshot;
  const db = await getDb();
  db.exec("BEGIN TRANSACTION");
  try {
    await updateMessageMailboxState(pending.message_id, {
      isInbox: snapshot.isInbox,
      isSent: snapshot.isSent,
      isDraft: snapshot.isDraft,
      isTrash: snapshot.isTrash,
    });
    await markPendingDeleteStatus(params.operationId, "cancelled", { cancelledAt: Date.now() });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  emitPendingDeleteStatus({
    operationId: params.operationId,
    messageId: pending.message_id,
    status: "delete_undone",
  });
  return { success: true };
}

export async function emptyTrash(): Promise<RadiusRPC["bun"]["requests"]["emptyTrash"]["response"]> {
  const db = await getDb();
  const accountEmail = getAccountEmail();
  const rows = db
    .query(`SELECT id FROM messages WHERE is_trash = 1`)
    .all() as Array<{ id: string }>;
  if (rows.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  try {
    if (!accountEmail) {
      return { success: false, error: "No active account found." };
    }
    const provider = getProvider(accountEmail);
    for (const row of rows) {
      await cancelPendingDelete(row.id);
      if (provider) {
        await provider.deleteMessage(row.id);
      } else {
        const accessToken = await getValidAccessTokenForEmail(accountEmail);
        await gmailDeleteMessage(accessToken, row.id);
      }
    }
    await removeMessages(rows.map((row) => row.id));
    return { success: true, deletedCount: rows.length };
  } catch (err) {
    return { success: false, error: mapDeleteError(err) };
  }
}

export async function resumePendingDeletes() {
  const db = await getDb();
  const rows = db
    .query(
      `SELECT id, status, undo_deadline_at
       FROM pending_message_deletes
       WHERE status = 'queued'`,
    )
    .all() as Array<{ id: string; undo_deadline_at: number }>;

  for (const row of rows) {
    if (row.undo_deadline_at <= Date.now()) {
      void commitPendingDelete(row.id);
    } else {
      schedulePendingDelete(row.id, row.undo_deadline_at);
    }
  }
}
