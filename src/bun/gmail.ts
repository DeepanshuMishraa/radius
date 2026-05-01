const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessagePart {
  mimeType: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  filename?: string;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  historyId: string;
  internalDate: string;
  snippet: string;
  payload: GmailMessagePart;
  labelIds: string[];
}

export type EmailCategory =
  | "important"
  | "promotional"
  | "social"
  | "updates"
  | "forums"
  | "spam"
  | "personal"
  | "regular";

/**
 * Classify an email from Gmail's native labelIds.
 * Gmail already categorizes mail — we just map their labels to friendly names.
 * Zero API cost, happens during sync.
 */
export function classifyFromLabels(labelIds: string[] | undefined): EmailCategory {
  if (!labelIds || labelIds.length === 0) return "regular";

  const labels = new Set(labelIds.map((l) => l.toUpperCase()));

  if (labels.has("SPAM")) return "spam";
  if (labels.has("CATEGORY_PROMOTIONS")) return "promotional";
  if (labels.has("CATEGORY_SOCIAL")) return "social";
  if (labels.has("CATEGORY_UPDATES")) return "updates";
  if (labels.has("CATEGORY_FORUMS")) return "forums";
  if (labels.has("CATEGORY_PERSONAL")) return "personal";
  if (labels.has("IMPORTANT")) return "important";

  return "regular";
}

export interface GmailHistoryItem {
  id: string;
  messagesAdded?: Array<{ message: { id: string } }>;
  labelsAdded?: Array<{ message: { id: string } }>;
  labelsRemoved?: Array<{ message: { id: string } }>;
}

export interface ModifyMessageLabelsResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface ListMessagesResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GetHistoryResponse {
  history?: GmailHistoryItem[];
  historyId?: string;
  nextPageToken?: string;
}

function getAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 5;
  const baseDelay = options.baseDelay ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetch(input, init);
    if (res.ok) return res;

    const text = await res.text();
    const error = new GmailAPIError(`request failed: ${res.status}`, res.status, text);

    if (error.isRateLimit() && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`Rate limited. Retrying in ${Math.round(delay)}ms...`);
      await Bun.sleep(delay);
      continue;
    }

    if (error.isAuthError() && attempt < maxRetries) {
      await Bun.sleep(500);
      continue;
    }

    throw error;
  }

  throw new Error("Max retries exceeded");
}

export async function listMessages(
  accessToken: string,
  options: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
  } = {}
): Promise<ListMessagesResponse> {
  const params = new URLSearchParams();
  params.set("maxResults", String(options.maxResults ?? 500));
  if (options.pageToken) params.set("pageToken", options.pageToken);
  if (options.q) params.set("q", options.q);

  const res = await fetch(`${GMAIL_API_BASE}/messages?${params.toString()}`, {
    headers: getAuthHeaders(accessToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GmailAPIError(`messages.list failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as ListMessagesResponse;
}

export async function getMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const res = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
    { headers: getAuthHeaders(accessToken) }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new GmailAPIError(`messages.get failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as GmailMessage;
}

export async function getMessageMetadata(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "From",
  });
  params.append("metadataHeaders", "To");
  params.append("metadataHeaders", "Subject");

  const res = await fetchWithRetry(
    `${GMAIL_API_BASE}/messages/${messageId}?${params.toString()}`,
    { headers: getAuthHeaders(accessToken) }
  );

  return (await res.json()) as GmailMessage;
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const res = await fetchWithRetry(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: getAuthHeaders(accessToken) }
  );

  const json = (await res.json()) as { data: string; size: number };
  return json.data;
}

export async function getHistory(
  accessToken: string,
  startHistoryId: string,
  options: {
    pageToken?: string;
    historyTypes?: string[];
  } = {}
): Promise<GetHistoryResponse> {
  const params = new URLSearchParams();
  params.set("startHistoryId", startHistoryId);
  params.set("labelId", "INBOX");
  params.set("maxResults", "100");
  if (options.pageToken) params.set("pageToken", options.pageToken);
  for (const historyType of options.historyTypes ?? [
    "messageAdded",
    "labelAdded",
    "labelRemoved",
  ]) {
    params.append("historyTypes", historyType);
  }

  const res = await fetch(`${GMAIL_API_BASE}/history?${params.toString()}`, {
    headers: getAuthHeaders(accessToken),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) {
      throw new HistoryGapError("History ID expired", res.status, text);
    }
    throw new GmailAPIError(`history.list failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as GetHistoryResponse;
}

export function isReadFromLabels(labelIds: string[] | undefined): boolean {
  if (!labelIds || labelIds.length === 0) return true;
  return !labelIds.some((label) => label.toUpperCase() === "UNREAD");
}

export async function modifyMessageLabels(
  accessToken: string,
  messageId: string,
  payload: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }
): Promise<ModifyMessageLabelsResponse> {
  const res = await fetchWithRetry(`${GMAIL_API_BASE}/messages/${messageId}/modify`, {
    method: "POST",
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  return (await res.json()) as ModifyMessageLabelsResponse;
}

export class GmailAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
    this.name = "GmailAPIError";
  }

  isRateLimit(): boolean {
    return this.status === 429;
  }

  isAuthError(): boolean {
    return this.status === 401;
  }
}

export class HistoryGapError extends GmailAPIError {
  constructor(message: string, status: number, body: string) {
    super(message, status, body);
    this.name = "HistoryGapError";
  }
}

interface InlineImage {
  contentId: string;
  mimeType: string;
  data: string; // standard base64 (not url-safe)
}

function normalizeBase64Url(data: string): string {
  return data.replace(/-/g, "+").replace(/_/g, "/");
}

function decodeBase64UrlToString(data: string): string {
  try {
    return Buffer.from(normalizeBase64Url(data), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extract plain text and HTML from Gmail message payload.
// Fetches large bodies and inline images via attachment IDs, and embeds
// images as data URLs so the HTML is self-contained.
export async function extractBodies(
  payload: GmailMessagePart,
  accessToken: string,
  messageId: string
): Promise<{ text: string | null; html: string | null }> {
  let text: string | null = null;
  let html: string | null = null;
  const inlineImages: InlineImage[] = [];

  async function traverse(part: GmailMessagePart, depth = 0): Promise<void> {
    // Normalize: "text/html; charset=utf-8" → "text/html"
    const rawMime = part.mimeType ?? "(none)";
    const mimeType = rawMime.split(";")[0].trim().toLowerCase();
    const indent = "  ".repeat(depth);
    const hasFilename = Boolean(part.filename?.trim());

    if (mimeType === "text/plain") {
      if (hasFilename) {
        console.log(`${indent}[body] text/plain — skipping attachment part filename=${part.filename}`);
      } else if (part.body?.data) {
        text = decodeBase64UrlToString(part.body.data);
        console.log(`${indent}[body] text/plain — inline data (${part.body.size ?? "?"} bytes) → text=${text ? text.length : 0} chars`);
      } else if (part.body?.attachmentId) {
        console.log(`${indent}[body] text/plain — attachmentId=${part.body.attachmentId.slice(0, 16)}…`);
        const raw = await getAttachment(accessToken, messageId, part.body.attachmentId);
        text = decodeBase64UrlToString(raw);
        console.log(`${indent}[body] text/plain — fetched attachment → text=${text ? text.length : 0} chars`);
      } else {
        console.log(`${indent}[body] text/plain — no data/attachmentId`);
      }
    } else if (mimeType === "text/html") {
      if (hasFilename) {
        console.log(`${indent}[body] text/html — skipping attachment part filename=${part.filename}`);
      } else if (part.body?.data) {
        html = decodeBase64UrlToString(part.body.data);
        console.log(`${indent}[body] text/html — inline data (${part.body.size ?? "?"} bytes) → html=${html ? html.length : 0} chars`);
      } else if (part.body?.attachmentId) {
        console.log(`${indent}[body] text/html — attachmentId=${part.body.attachmentId.slice(0, 16)}…`);
        const raw = await getAttachment(accessToken, messageId, part.body.attachmentId);
        html = decodeBase64UrlToString(raw);
        console.log(`${indent}[body] text/html — fetched attachment → html=${html ? html.length : 0} chars`);
      } else {
        console.log(`${indent}[body] text/html — no data/attachmentId`);
      }
    } else if (mimeType?.startsWith("image/") && part.body?.attachmentId) {
      const contentId = part.headers?.find(
        (h) => h.name.toLowerCase() === "content-id"
      )?.value;
      if (contentId) {
        const cleanId = contentId.replace(/^<|>$/g, "");
        const raw = await getAttachment(accessToken, messageId, part.body.attachmentId);
        inlineImages.push({
          contentId: cleanId,
          mimeType,
          data: normalizeBase64Url(raw),
        });
      }
    }

    if (part.parts) {
      console.log(`${indent}[container] ${rawMime} — ${part.parts.length} sub-part(s)`);
      for (const sub of part.parts) {
        await traverse(sub, depth + 1);
      }
    }
  }

  await traverse(payload);

  const textLen = text ? (text as unknown as string).length : 0;
  const htmlLen = html ? (html as unknown as string).length : 0;
  console.log(`[extractBodies] ${messageId.slice(0, 16)}… → text=${textLen}, html=${htmlLen}, images=${inlineImages.length}`);

  // Replace cid: references in HTML with embedded data URLs
  if (html && inlineImages.length > 0) {
    let processedHtml: string = html;
    for (const img of inlineImages) {
      const dataUrl = `data:${img.mimeType};base64,${img.data}`;

      // Exact match: cid:xxx@domain
      const exactRef = `cid:${img.contentId}`;
      processedHtml = processedHtml.replace(
        new RegExp(escapeRegExp(exactRef), "g"),
        dataUrl
      );

      // Basename match: cid:xxx (some clients drop the domain)
      const basename = img.contentId.split("@")[0];
      if (basename && basename !== img.contentId) {
        const basenameRef = `cid:${basename}`;
        processedHtml = processedHtml.replace(
          new RegExp(escapeRegExp(basenameRef), "g"),
          dataUrl
        );
      }
    }
    html = processedHtml;
  }

  return { text, html };
}

export function parseHeaders(
  headers: Array<{ name: string; value: string }>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    result[h.name.toLowerCase()] = h.value;
  }
  return result;
}
