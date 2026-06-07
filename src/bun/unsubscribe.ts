export interface ParsedListUnsubscribe {
  urls: string[];
  mailto: string[];
  oneClick: boolean;
}

export function parseListUnsubscribeHeader(
  raw: string | null | undefined,
  listUnsubscribePost?: string | null | undefined
): ParsedListUnsubscribe {
  const result: ParsedListUnsubscribe = { urls: [], mailto: [], oneClick: false };

  if (!raw) return result;

  if (listUnsubscribePost && /one-click/i.test(listUnsubscribePost)) {
    result.oneClick = true;
  }

  const parts = raw.split(",").map((p) => p.trim());
  for (const part of parts) {
    const match = part.match(/^<(https?:\/\/[^>]+)>$/i);
    if (match) {
      result.urls.push(match[1]);
      continue;
    }
    const mailtoMatch = part.match(/^<mailto:([^>]+)>$/i);
    if (mailtoMatch) {
      result.mailto.push(mailtoMatch[1]);
      continue;
    }
  }

  return result;
}

export function getUnsubscribeMethod(
  raw: string | null | undefined
): "url" | "mailto" | "both" | "none" {
  if (!raw) return "none";
  const parsed = parseListUnsubscribeHeader(raw);
  if (parsed.urls.length > 0 && parsed.mailto.length > 0) return "both";
  if (parsed.urls.length > 0) return "url";
  if (parsed.mailto.length > 0) return "mailto";
  return "none";
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendUnsubscribeRequest(
  url: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Radius/1.0",
      },
    });

    if (response.ok || response.status === 301 || response.status === 302) {
      return { success: true };
    }

    if (response.status === 410) {
      return { success: true };
    }

    if (response.status >= 400 && response.status < 500) {
      return { success: false, error: `Unsubscribe link responded with ${response.status}` };
    }

    if (response.status >= 500) {
      return { success: false, error: `Unsubscribe server error: ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Unsubscribe request timed out" };
    }
    return { success: false, error: String(err) };
  }
}

export async function sendUnsubscribeViaGet(
  url: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "User-Agent": "Radius/1.0",
      },
    });

    if (response.ok || response.status === 301 || response.status === 302) {
      return { success: true };
    }

    return { success: false, error: `Unsubscribe responded with ${response.status}` };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Unsubscribe request timed out" };
    }
    return { success: false, error: String(err) };
  }
}

export async function blockSenderViaGmail(
  senderEmail: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const filter = {
      criteria: {
        from: senderEmail,
      },
      action: {
        delete: true,
      },
    };

    const response = await fetchWithTimeout(
      "https://www.googleapis.com/gmail/v1/users/me/settings/filters",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(filter),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `Gmail filter creation failed: ${response.status} - ${body}` };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Block sender request timed out" };
    }
    return { success: false, error: String(err) };
  }
}
