const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessage {
  id: string;
  threadId: string;
  historyId: string;
  internalDate: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string; size?: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size?: number };
      parts?: Array<{
        mimeType: string;
        body?: { data?: string; size?: number };
      }>;
    }>;
  };
  labelIds: string[];
}

export interface GmailHistoryItem {
  id: string;
  messagesAdded?: Array<{ message: { id: string } }>;
  labelsAdded?: Array<{ message: { id: string } }>;
  labelsRemoved?: Array<{ message: { id: string } }>;
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

export async function getHistory(
  accessToken: string,
  startHistoryId: string
): Promise<GetHistoryResponse> {
  const params = new URLSearchParams();
  params.set("startHistoryId", startHistoryId);
  params.set("labelId", "INBOX");
  params.set("historyTypes", "messageAdded");
  params.set("maxResults", "100");

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

// Extract plain text and HTML from Gmail message payload
export function extractBodies(payload: GmailMessage["payload"]): {
  text: string | null;
  html: string | null;
} {
  let text: string | null = null;
  let html: string | null = null;

  function traverse(part: typeof payload | (typeof payload.parts)[0]): void {
    const mimeType = "mimeType" in part ? part.mimeType : undefined;

    if (mimeType === "text/plain" && part.body?.data) {
      text = decodeBase64(part.body.data);
    } else if (mimeType === "text/html" && part.body?.data) {
      html = decodeBase64(part.body.data);
    } else if ("parts" in part && part.parts) {
      for (const sub of part.parts) traverse(sub);
    }
  }

  traverse(payload);
  return { text, html };
}

function decodeBase64(data: string): string {
  // Gmail uses URL-safe base64
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(normalized);
  } catch {
    return "";
  }
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
