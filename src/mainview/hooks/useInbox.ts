import { useState, useEffect, useCallback } from "react";
import { radiusRpc } from "../lib/rpc";

export interface Message {
  id: string;
  threadId: string;
  historyId: string;
  internalDate: number;
  from: string;
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
  initialSyncCompletedAt?: number;
  fullSyncCompletedAt?: number;
  error?: string;
}

export function useInbox(limit: number = 50, offset: number = 0) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const result = await radiusRpc.request.getInbox({ limit, offset });
      setMessages(result.messages);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to fetch inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  return { messages, total, loading, refresh: fetchInbox };
}

export function useMessage(id: string | null) {
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setMessage(null);
      return;
    }

    setLoading(true);
    radiusRpc.request
      .getMessage({ id })
      .then((msg) => setMessage(msg))
      .catch((err: unknown) => console.error("Failed to fetch message:", err))
      .finally(() => setLoading(false));
  }, [id]);

  return { message, loading };
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const s = await radiusRpc.request.getSyncStatus({});
        if (!cancelled) setStatus(s);
      } catch (err) {
        console.error("Sync status poll failed:", err);
      }
    }

    // Poll immediately and frequently enough for visible sync progress.
    poll();
    const interval = setInterval(poll, 500);

    // Also listen for push events from main process
    const handler = (e: Event) => {
      const data = (e as CustomEvent<SyncStatus>).detail;
      setStatus(data);
    };
    window.addEventListener("radius:syncProgress", handler);

    return () => {
      cancelled = true;
      clearInterval(interval);
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
      setIsAuthenticated(
        Boolean(status.initialSyncCompletedAt ?? status.lastSyncAt)
      );
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  const startOAuth = useCallback(async () => {
    const result = await radiusRpc.request.startOAuth({});
    return result.success;
  }, []);

  const startSync = useCallback(async () => {
    const result = await radiusRpc.request.startSync({});
    return result.success;
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { isAuthenticated, startOAuth, startSync, checkAuth };
}
