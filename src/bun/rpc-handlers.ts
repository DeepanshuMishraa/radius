import { createHash } from "node:crypto";
import type { RadiusRPC } from "../shared/types";
import { getInboxMessages, searchInboxMessages, getMessageById, updateMessageBodies, getSyncState, setMessageReadState, getComposeContactRows, getComposeSessionRecipientRows, searchComposeContacts, upsertComposeContacts, getMailboxMessages as getStoredMailboxMessages, getSenderAvatarsBatch, upsertSenderAvatar, getAllSenderAvatars } from "./db";
import { getAccountEmail, getValidAccessToken } from "./auth";
import { getMessage as getGmailMessage, extractBodies, getAttachment, modifyMessageLabels, GmailAPIError, parseHeaders, classifyMessageNature, isReadFromLabels } from "./gmail";
import {
  createComposeSession,
  discardComposeSession,
  queueSendForSession,
  saveDraftForSession,
  undoPendingSend,
  updateComposeSession,
} from "./compose";

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
export const handleUpdateComposeSession = updateComposeSession;
export const handleSaveDraft = saveDraftForSession;
export const handleQueueSend = queueSendForSession;
export const handleUndoSend = undoPendingSend;
export const handleDiscardComposeSession = discardComposeSession;
export { handleResyncAccount } from "./sync-lifecycle";

const DOMAIN_ALIASES: Record<string, string> = {
  "redditmail.com": "reddit.com",
  "pinterestmail.com": "pinterest.com",
  "quoramail.com": "quora.com",
};

function resolveDomainAlias(domain: string): string {
  return DOMAIN_ALIASES[domain] ?? domain;
}

function getBaseDomain(domain: string): string {
  const aliased = resolveDomainAlias(domain);
  if (aliased !== domain) return aliased;
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  if (['co', 'com', 'org', 'net'].includes(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

export async function handleGetAllSenderAvatars(): Promise<{ avatars: Record<string, string | null> }> {
  const avatars = await getAllSenderAvatars();
  return { avatars };
}

function md5Hex(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export async function handleGetSenderAvatars(params: { domains: string[]; emails?: string[] }): Promise<{ avatars: Record<string, string | null> }> {
  const domains = [...new Set(params.domains.map(d => getBaseDomain(d.toLowerCase())))].slice(0, 100);
  const emails = [...new Set((params.emails ?? []).map(e => e.trim().toLowerCase()))].slice(0, 100);

  const allKeys = [...domains, ...emails];
  if (allKeys.length === 0) return { avatars: {} };

  // Check cache first — treat stale Clearbit URLs as missing
  const cached = await getSenderAvatarsBatch(allKeys);
  const missingDomains = domains.filter(d => {
    const url = cached[d];
    return !(d in cached) || url == null || url.includes('logo.clearbit.com');
  });
  const missingEmails = emails.filter(e => {
    const url = cached[e];
    return !(e in cached) || url == null;
  });

  // Fetch missing company logos from Hunter.io in parallel
  if (missingDomains.length > 0) {
    const results = await Promise.allSettled(
      missingDomains.map(async (domain) => {
        try {
          const res = await fetch(`https://logos.hunter.io/${domain}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
          });
          const url = res.ok ? `https://logos.hunter.io/${domain}` : null;
          await upsertSenderAvatar(domain, url);
          return { key: domain, url };
        } catch {
          await upsertSenderAvatar(domain, null);
          return { key: domain, url: null };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        cached[result.value.key] = result.value.url;
      }
    }
  }

  // Fetch missing personal avatars from Gravatar in parallel
  if (missingEmails.length > 0) {
    const results = await Promise.allSettled(
      missingEmails.map(async (email) => {
        try {
          const hash = md5Hex(email);
          const gravatarUrl = `https://gravatar.com/avatar/${hash}?d=404&s=80`;
          const res = await fetch(gravatarUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
          });
          const url = res.ok && res.status !== 404 ? gravatarUrl : null;
          await upsertSenderAvatar(email, url);
          return { key: email, url };
        } catch {
          await upsertSenderAvatar(email, null);
          return { key: email, url: null };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        cached[result.value.key] = result.value.url;
      }
    }
  }

  return { avatars: cached };
}
