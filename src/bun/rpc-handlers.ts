import type { RadiusRPC } from "../shared/types";
import { getInboxMessages, searchInboxMessages, getMessageById, updateMessageBodies, getSyncState, setMessageReadState, getComposeContactRows, getComposeSessionRecipientRows, searchComposeContacts, upsertComposeContacts, getMailboxMessages as getStoredMailboxMessages } from "./db";
import { getAccountEmail, getValidAccessToken } from "./auth";
import { getMessage as getGmailMessage, extractBodies, getAttachment, modifyMessageLabels, GmailAPIError, parseHeaders, classifyMessageNature, isReadFromLabels } from "./gmail";
import {
  createComposeSession,
  createReplyForwardSession,
  discardComposeSession,
  queueSendForSession,
  saveDraftForSession,
  undoPendingSend,
  updateComposeSession,
} from "./compose";
import {
  emptyTrash,
  handleGetThreadMessages as getThreadMessagesForRpc,
  queueDeleteMessage,
  undoDeleteMessage,
} from "./message-actions";

function toRpcMessage(
  gmailMessage: Awaited<ReturnType<typeof getGmailMessage>>,
) {
  const headers = parseHeaders(gmailMessage.payload.headers ?? []);

  return {
    id: gmailMessage.id,
    threadId: gmailMessage.threadId,
    historyId: gmailMessage.historyId,
    internalDate: parseInt(gmailMessage.internalDate, 10),
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    snippet: gmailMessage.snippet,
    bodyText: null,
    bodyHtml: null,
    attachments: [],
    category: classifyMessageNature({
      labelIds: gmailMessage.labelIds,
      from: headers["from"],
      subject: headers["subject"],
      snippet: gmailMessage.snippet,
    }),
    isRead: isReadFromLabels(gmailMessage.labelIds),
  } satisfies RadiusRPC["bun"]["requests"]["getMessage"]["response"];
}

function normalizeMessageRecord(
  message: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!message) return null;

  let attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = [];
  if (typeof message.attachments === "string" && message.attachments) {
    try {
      attachments = JSON.parse(message.attachments);
    } catch {
      attachments = [];
    }
  }

  return {
    ...message,
    attachments,
    category:
      typeof message.category === "string" ? message.category : "regular",
    isRead: Boolean(message.isRead),
    isInbox: Boolean(message.isInbox),
    isSent: Boolean(message.isSent),
    isDraft: Boolean(message.isDraft),
    isTrash: Boolean(message.isTrash),
  };
}

function normalizeMessageListRecord(
  message: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeMessageRecord(message) ?? message;
}

export { toRpcMessage };

export async function handleGetInbox(params: { limit: number; offset: number }) {
  const { limit, offset } = params;
  const result = await getInboxMessages(limit, offset);
  return {
    messages: result.messages.map((message) =>
      normalizeMessageListRecord(message),
    ) as unknown as RadiusRPC["bun"]["requests"]["getInbox"]["response"]["messages"],
    total: result.total,
  };
}

export async function handleSearchInbox(params: { query: string; limit: number; offset: number }) {
  const { query, limit, offset } = params;
  const result = await searchInboxMessages(query, limit, offset);
  return {
    messages: result.messages.map((message) =>
      normalizeMessageListRecord(message),
    ) as unknown as RadiusRPC["bun"]["requests"]["searchInbox"]["response"]["messages"],
    total: result.total,
  };
}

export async function handleGetMessage(params: { id: string }) {
  const { id } = params;
  let msg = await getMessageById(id);

  // On-demand body + attachment fetch only when we have no stored body at all.
  if (msg && msg.bodyHtml == null && msg.bodyText == null) {
    try {
      const accessToken = await getValidAccessToken();
      const gmailMsg = await getGmailMessage(accessToken, id);
      const bodies = await extractBodies(
        gmailMsg.payload,
        accessToken,
        id,
      );

      if (bodies.html != null || bodies.text != null) {
        await updateMessageBodies(id, bodies.text, bodies.html);
        msg = await getMessageById(id);
      }
    } catch (err) {
      console.error(`Failed to fetch body for message ${id}:`, err);
    }
  }

  if (!msg) {
    try {
      const accessToken = await getValidAccessToken();
      const gmailMsg = await getGmailMessage(accessToken, id);
      const bodies = await extractBodies(gmailMsg.payload, accessToken, id);
      const rpcMessage = toRpcMessage(gmailMsg);
      return {
        ...rpcMessage,
        bodyText: bodies.text,
        bodyHtml: bodies.html,
      };
    } catch (err) {
      console.error(`Failed to fetch remote message ${id}:`, err);
    }
  }

  return normalizeMessageRecord(msg) as RadiusRPC["bun"]["requests"]["getMessage"]["response"];
}

export async function handleGetMailboxMessages(params: {
  mailbox: "sent" | "drafts" | "trash";
  limit?: number;
}): Promise<RadiusRPC["bun"]["requests"]["getMailboxMessages"]["response"]> {
  const result = await getStoredMailboxMessages(params.mailbox, Math.min(params.limit ?? 100, 100), 0);
  return {
    messages: result.messages.map((message) =>
      normalizeMessageListRecord(message),
    ) as unknown as RadiusRPC["bun"]["requests"]["getMailboxMessages"]["response"]["messages"],
    total: result.total,
  };
}

function parseAddressCandidates(value: string | null | undefined): Array<{ name: string; email: string }> {
  if (!value) return [];
  return value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => {
      const match = chunk.match(/^"?([^"<]+)"?\s*(?:<([^>]+)>)?$/);
      const email = (match?.[2] ?? (chunk.includes("@") ? chunk : "")).trim().toLowerCase();
      if (!email) return [];
      const name = (match?.[1]?.trim() || email).replace(/^"|"$/g, "");
      return [{ name, email }];
    });
}

export async function handleGetComposeSuggestions(params: {
  query?: string;
  limit?: number;
}): Promise<
  RadiusRPC["bun"]["requests"]["getComposeSuggestions"]["response"]
> {
  const accountEmail = getAccountEmail();
  if (!accountEmail) {
    return { contacts: [] };
  }

  const [messageRows, composeRows] = await Promise.all([
    getComposeContactRows(),
    getComposeSessionRecipientRows(),
  ]);

  const candidates = new Map<string, { email: string; name: string }>();

  const pushCandidate = (name: string, email: string) => {
    if (candidates.has(email)) return;
    candidates.set(email, { name, email });
  };

  for (const row of messageRows) {
    for (const candidate of [
      ...parseAddressCandidates(row.fromAddr),
      ...parseAddressCandidates(row.toAddr),
    ]) {
      pushCandidate(candidate.name, candidate.email);
    }
  }

  for (const row of composeRows) {
    for (const value of [row.toRecipients, row.ccRecipients, row.bccRecipients]) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) continue;
        for (const item of parsed) {
          if (typeof item !== "string") continue;
          const email = item.trim().toLowerCase();
          if (!email) continue;
          pushCandidate(email, email);
        }
      } catch {
        continue;
      }
    }
  }

  await upsertComposeContacts(accountEmail, Array.from(candidates.values()));
  const rows = await searchComposeContacts(
    accountEmail,
    params.query ?? "",
    Math.min(params.limit ?? 8, 20),
  );
  return {
    contacts: rows.map((row) => ({
      name: row.name || row.email,
      email: row.email,
      label: row.name && row.name !== row.email ? `${row.name} <${row.email}>` : row.email,
      source: "history" as const,
    })),
  };
}

export async function handleGetSyncStatus() {
  const state = await getSyncState();
  return {
    status:
      state.status as RadiusRPC["bun"]["requests"]["getSyncStatus"]["response"]["status"],
    phase:
      (state.phase as "initial" | "background" | undefined) ??
      undefined,
    progress:
      state.progressCurrent !== null && state.progressTotal !== null
        ? { current: state.progressCurrent, total: state.progressTotal }
        : undefined,
    lastSyncAt: state.lastSyncAt ?? undefined,
    initialSyncCompletedAt: state.initialSyncCompletedAt ?? undefined,
    fullSyncCompletedAt: state.fullSyncCompletedAt ?? undefined,
    syncMode: (state.syncMode === "all" ? "all" : "recent") as "recent" | "all",
    fullSyncPending: state.backgroundSyncPending,
    error: state.error ?? undefined,
  };
}

export async function handleMarkMessageRead(params: { id: string }): Promise<{
  success: boolean;
  error?: string;
  code?: "reauth_required" | "remote_sync_failed";
  localStateApplied?: boolean;
}> {
  const { id } = params;
  try {
    const message = await getMessageById(id);
    if (!message) {
      return { success: false, error: `Message not found: ${id}` };
    }

    if (Boolean(message.isRead)) {
      return { success: true, localStateApplied: true };
    }

    await setMessageReadState(id, true);
    const accessToken = await getValidAccessToken();
    await modifyMessageLabels(accessToken, id, {
      removeLabelIds: ["UNREAD"],
    });
    return { success: true, localStateApplied: true };
  } catch (err) {
    console.error("markMessageRead error:", err);
    if (
      err instanceof GmailAPIError &&
      err.status === 403 &&
      err.body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
    ) {
      return {
        success: false,
        error:
          "Gmail read sync needs fresh Gmail modify permission. Reconnect Gmail once to enable it.",
        code: "reauth_required",
        localStateApplied: true,
      };
    }

    return {
      success: false,
      error: String(err),
      code: "remote_sync_failed" as const,
      localStateApplied: true,
    };
  }
}

export async function handleMarkMessageUnread(params: { id: string }): Promise<{
  success: boolean;
  error?: string;
  code?: "reauth_required" | "remote_sync_failed";
  localStateApplied?: boolean;
}> {
  const { id } = params;
  try {
    const message = await getMessageById(id);
    if (!message) {
      return { success: false, error: `Message not found: ${id}` };
    }

    if (!Boolean(message.isRead)) {
      return { success: true, localStateApplied: true };
    }

    await setMessageReadState(id, false);
    const accessToken = await getValidAccessToken();
    await modifyMessageLabels(accessToken, id, {
      addLabelIds: ["UNREAD"],
    });
    return { success: true, localStateApplied: true };
  } catch (err) {
    console.error("markMessageUnread error:", err);
    if (
      err instanceof GmailAPIError &&
      err.status === 403 &&
      err.body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
    ) {
      return {
        success: false,
        error:
          "Gmail read sync needs fresh Gmail modify permission. Reconnect Gmail once to enable it.",
        code: "reauth_required",
        localStateApplied: true,
      };
    }

    return {
      success: false,
      error: String(err),
      code: "remote_sync_failed" as const,
      localStateApplied: true,
    };
  }
}

export async function handleDownloadAttachment(params: { messageId: string; attachmentId: string }) {
  try {
    const accessToken = await getValidAccessToken();
    const data = await getAttachment(accessToken, params.messageId, params.attachmentId);
    return {
      success: true,
      data,
    };
  } catch (err) {
    console.error("downloadAttachment error:", err);
    return {
      success: false,
      error: String(err),
    };
  }
}

export const handleCreateComposeSession = createComposeSession;
export const handleCreateReplyForwardSession = createReplyForwardSession;
export const handleUpdateComposeSession = updateComposeSession;
export const handleSaveDraft = saveDraftForSession;
export const handleQueueSend = queueSendForSession;
export const handleUndoSend = undoPendingSend;
export const handleDiscardComposeSession = discardComposeSession;
export const handleGetThreadMessages = getThreadMessagesForRpc;
export const handleQueueDeleteMessage = queueDeleteMessage;
export const handleUndoDeleteMessage = undoDeleteMessage;
export const handleEmptyTrash = emptyTrash;
export { handleResyncAccount } from "./sync-lifecycle";
