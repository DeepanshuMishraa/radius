import type { RadiusRPC } from "../shared/types";
import { getInboxMessages, searchInboxMessages, getMessageById, updateMessageBodies, getSyncState, setMessageReadState } from "./db";
import { getValidAccessToken } from "./auth";
import { getMessage as getGmailMessage, extractBodies, modifyMessageLabels, GmailAPIError, parseHeaders, classifyMessageNature, isReadFromLabels } from "./gmail";

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

  return {
    ...message,
    category:
      typeof message.category === "string" ? message.category : "regular",
    isRead: Boolean(message.isRead),
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

  // On-demand body fetch only when we have no stored body at all.
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

  return normalizeMessageRecord(
    msg,
  ) as RadiusRPC["bun"]["requests"]["getMessage"]["response"];
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