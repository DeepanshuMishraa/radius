import { useState, useEffect, useCallback, useRef } from "react";
import { radiusRpc } from "../lib/rpc";

export interface Message {
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
}

export interface SyncStatus {
  status: "idle" | "syncing" | "error" | "offline";
  phase?: "initial" | "background";
  progress?: {
    current: number;
    total: number;
  };
  lastSyncAt?: number;
  fullSyncCompletedAt?: number;
  error?: string;
}

function areMessagesEqual(next: Message[], prev: Message[]) {
  if (next === prev) return true;
  if (next.length !== prev.length) return false;

  for (let i = 0; i < next.length; i += 1) {
    const nextMessage = next[i];
    const prevMessage = prev[i];

    if (
      nextMessage.id !== prevMessage.id ||
      nextMessage.internalDate !== prevMessage.internalDate ||
      nextMessage.from !== prevMessage.from ||
      nextMessage.subject !== prevMessage.subject ||
      nextMessage.snippet !== prevMessage.snippet
    ) {
      return false;
    }
  }

  return true;
}

function areSyncStatusesEqual(next: SyncStatus, prev: SyncStatus) {
  return (
    next.status === prev.status &&
    next.phase === prev.phase &&
    next.lastSyncAt === prev.lastSyncAt &&
    next.fullSyncCompletedAt === prev.fullSyncCompletedAt &&
    next.error === prev.error &&
    next.progress?.current === prev.progress?.current &&
    next.progress?.total === prev.progress?.total
  );
}

export function useInbox(
  limit: number = 200,
  offset: number = 0,
  pollMs: number | null = null
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const result = await radiusRpc.request.getInbox({ limit, offset });
      setMessages((prev) =>
        areMessagesEqual(result.messages, prev) ? prev : result.messages
      );
      setTotal((prev) => (prev === result.total ? prev : result.total));
    } catch (err) {
      console.error("Failed to fetch inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    if (pollMs === null) return;

    const interval = setInterval(fetchInbox, pollMs);
    return () => clearInterval(interval);
  }, [fetchInbox, pollMs]);

  return { messages, total, loading, refresh: fetchInbox };
}

export function useInboxSearch(
  query: string,
  limit: number = 200,
  offset: number = 0
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = query.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!trimmedQuery) {
      setMessages([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    radiusRpc.request
      .searchInbox({ query: trimmedQuery, limit, offset })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setMessages((prev) =>
          areMessagesEqual(result.messages, prev) ? prev : result.messages
        );
        setTotal((prev) => (prev === result.total ? prev : result.total));
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        console.error("Failed to search inbox:", err);
        setMessages([]);
        setTotal(0);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [limit, offset, query]);

  return { messages, total, loading };
}

export function useMessage(id: string | null) {
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(new Map<string, Message | null>());
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!id) {
      setMessage(null);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(id);
    if (cached !== undefined) {
      setMessage(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    radiusRpc.request
      .getMessage({ id })
      .then((msg) => {
        cacheRef.current.set(id, msg);
        if (requestIdRef.current === requestId) {
          setMessage(msg);
        }
      })
      .catch((err: unknown) => console.error("Failed to fetch message:", err))
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [id]);

  return { message, loading };
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const s = await radiusRpc.request.getSyncStatus({});
        if (!cancelled) {
          setStatus((prev) => (areSyncStatusesEqual(s, prev) ? prev : s));
          const nextPollMs = s.status === "syncing" ? 500 : 3000;
          timeoutId = setTimeout(poll, nextPollMs);
        }
      } catch (err) {
        console.error("Sync status poll failed:", err);
        if (!cancelled) {
          timeoutId = setTimeout(poll, 3000);
        }
      }
    }

    poll();

    const handler = (e: Event) => {
      const data = (e as CustomEvent<SyncStatus>).detail;
      setStatus((prev) => (areSyncStatusesEqual(data, prev) ? prev : data));
    };
    window.addEventListener("radius:syncProgress", handler);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("radius:syncProgress", handler);
    };
  }, []);

  return status;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const status = await radiusRpc.request.getSyncStatus({});
      // Authenticated as soon as we have a refresh token (lastSyncAt set on callback)
      setIsAuthenticated(Boolean(status.lastSyncAt));
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  const startOAuth = useCallback(async () => {
    const result = await radiusRpc.request.startOAuth({});
    return result.success;
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { isAuthenticated, startOAuth };
}
