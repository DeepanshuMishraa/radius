import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import type { CSSProperties } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox, useInboxSearch, useMessage } from "./hooks/useInbox";
import type { Message } from "./hooks/useInbox";
import { CommandK } from "@/components/cmd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";
import { XIcon } from "@phosphor-icons/react";
import { radiusRpc } from "./lib/rpc";

function parseAddressLabel(address: string | null | undefined) {
  if (!address) return { name: "Radius", email: "" };
  const match = address.match(/^"?([^"<]+)"?\s*(?:<([^>]+)>)?$/);
  if (match) {
    return {
      name: match[1].trim() || match[2]?.trim() || "Radius",
      email: match[2]?.trim() || "",
    };
  }
  return { name: address, email: "" };
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function App() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [messageOverrides, setMessageOverrides] = useState<
    Record<string, Partial<Message>>
  >({});
  const pendingReadRef = useRef(new Set<string>());
  const failedReadRef = useRef(new Set<string>());
  const [gmailSyncNotice, setGmailSyncNotice] = useState<string | null>(null);
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);
  const [notificationPromptMode, setNotificationPromptMode] = useState<
    "default" | "followup"
  >("default");
  const [newMailToast, setNewMailToast] = useState<Message | null>(null);
  const newMailToastTimeoutRef = useRef<number | null>(null);

  const { isAuthenticated, startOAuth } = useAuth();
  const syncStatus = useSyncStatus();
  const { messages, total } = useInbox(
    1000,
    0,
    syncStatus.status === "syncing" ? 2000 : 8000
  );
  const debouncedSearchQuery = useDebouncedValue(searchDraft, 120);
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  const searchActive = searchOpen && deferredSearchQuery.trim().length > 0;
  const {
    messages: searchedMessages,
    total: searchedTotal,
    loading: searchLoading,
  } = useInboxSearch(searchActive ? deferredSearchQuery : "", 250, 0);
  const applyMessageOverrides = useCallback(
    (items: Message[]) =>
      items.map((message) =>
        messageOverrides[message.id]
          ? { ...message, ...messageOverrides[message.id] }
          : message
      ),
    [messageOverrides]
  );
  const mergedInboxMessages = useMemo(
    () => applyMessageOverrides(messages),
    [applyMessageOverrides, messages]
  );
  const mergedSearchMessages = useMemo(
    () => applyMessageOverrides(searchedMessages),
    [applyMessageOverrides, searchedMessages]
  );
  const { message: fullMessage } = useMessage(selectedMessageId);
  const hasAuthSignal = isAuthenticated === true || Boolean(syncStatus.lastSyncAt);
  const visibleMessages = searchActive ? mergedSearchMessages : mergedInboxMessages;
  const visibleTotal = searchActive ? searchedTotal : total;
  const messagesById = useMemo(() => {
    return new Map(visibleMessages.map((message) => [message.id, message]));
  }, [visibleMessages]);
  const selectedMessagePreview = selectedMessageId
    ? messagesById.get(selectedMessageId) ?? null
    : null;
  const selectedMessage = useMemo(() => {
    const baseMessage =
      fullMessage && fullMessage.id === selectedMessageId
        ? fullMessage
        : selectedMessagePreview;
    if (!baseMessage) return null;

    const override = messageOverrides[baseMessage.id];
    return override ? { ...baseMessage, ...override } : baseMessage;
  }, [fullMessage, messageOverrides, selectedMessageId, selectedMessagePreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handleNewMail = (incomingMessage: Message) => {
      setNewMailToast(incomingMessage);
    };

    radiusRpc.addMessageListener("newMail", handleNewMail);
    return () => {
      radiusRpc.removeMessageListener("newMail", handleNewMail);
    };
  }, []);

  useEffect(() => {
    if (!newMailToast) {
      if (newMailToastTimeoutRef.current !== null) {
        window.clearTimeout(newMailToastTimeoutRef.current);
        newMailToastTimeoutRef.current = null;
      }
      return;
    }

    if (newMailToastTimeoutRef.current !== null) {
      window.clearTimeout(newMailToastTimeoutRef.current);
    }

    newMailToastTimeoutRef.current = window.setTimeout(() => {
      setNewMailToast(null);
      newMailToastTimeoutRef.current = null;
    }, 6500);

    return () => {
      if (newMailToastTimeoutRef.current !== null) {
        window.clearTimeout(newMailToastTimeoutRef.current);
        newMailToastTimeoutRef.current = null;
      }
    };
  }, [newMailToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nativeNotificationsEnabled =
      window.localStorage.getItem("radius.notifications.enabled") === "true";
    const browserPermission =
      "Notification" in window ? window.Notification.permission : "default";
    setNotificationPromptVisible(
      !nativeNotificationsEnabled && browserPermission !== "granted"
    );
  }, []);

  const openNotificationSettings = useCallback(async () => {
    try {
      const result = await radiusRpc.request.openNotificationSettings({});
      if (!result.success) {
        throw new Error(result.error ?? "Failed to open notification settings");
      }
    } catch (error) {
      console.error("Open notification settings failed:", error);
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    try {
      const platform =
        typeof window !== "undefined"
          ? (
              window.navigator as Navigator & {
                userAgentData?: { platform?: string };
              }
            ).userAgentData?.platform ?? window.navigator.platform ?? ""
          : "";
      const isMacOS = /mac/i.test(platform);
      const result = await radiusRpc.request.requestNotificationPermission({});
      if (!result.success) {
        throw new Error(result.error ?? "Failed to request notifications");
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("radius.notifications.enabled", "true");
      }
      if (isMacOS) {
        setNotificationPromptMode("followup");
        setNotificationPromptVisible(true);
        await openNotificationSettings();
        return;
      }
      setNotificationPromptVisible(false);
    } catch (error) {
      console.error("Notification permission request failed:", error);
      setNotificationPromptMode("followup");
      setNotificationPromptVisible(true);
    }
  }, [openNotificationSettings]);

  const dismissNotificationPrompt = useCallback(() => {
    setNotificationPromptVisible(false);
  }, []);

  const handleConnect = useCallback(async () => {
    await startOAuth();
  }, [startOAuth]);

  const handleSelectMessage = useCallback((id: string) => {
    setSelectedMessageId(id);
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!selectedMessage || selectedMessage.isRead) return;
    if (pendingReadRef.current.has(selectedMessage.id)) return;
    if (failedReadRef.current.has(selectedMessage.id)) return;

    pendingReadRef.current.add(selectedMessage.id);
    setMessageOverrides((prev) => ({
      ...prev,
      [selectedMessage.id]: {
        ...(prev[selectedMessage.id] ?? {}),
        isRead: true,
      },
    }));

    radiusRpc.request
      .markMessageRead({ id: selectedMessage.id })
      .then((result) => {
        if (!result.success && result.code !== "reauth_required") {
          throw new Error(result.error ?? "Failed to mark message read");
        }
        if (result.code === "reauth_required") {
          setGmailSyncNotice(result.error ?? "Reconnect Gmail to sync read state.");
          return;
        }
        failedReadRef.current.delete(selectedMessage.id);
      })
      .catch((err) => {
        console.error("Failed to mark message read:", err);
        failedReadRef.current.add(selectedMessage.id);
        setGmailSyncNotice("Could not sync read state to Gmail right now.");
      })
      .finally(() => {
        pendingReadRef.current.delete(selectedMessage.id);
      });
  }, [selectedMessage]);

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setCmdOpen(false);
    setSearchOpen(true);
    setSidebarOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchDraft("");
  }, []);

  const dismissNewMailToast = useCallback(() => {
    setNewMailToast(null);
  }, []);

  const handleOpenNewMailToast = useCallback(() => {
    if (!newMailToast) return;
    setSelectedMessageId(newMailToast.id);
    setSidebarOpen(false);
    setNewMailToast(null);
  }, [newMailToast]);

  const handleSubmitSearch = useCallback(() => {
    if (searchedMessages.length > 0) {
      setSelectedMessageId(searchedMessages[0].id);
      setSidebarOpen(false);
      setSearchOpen(false);
    }
  }, [searchedMessages]);

  const searchMeta = useMemo(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    if (!searchOpen) return null;
    if (!trimmedQuery) return "Search sender, subject, snippet, or body text";
    if (searchLoading) return `Searching for “${trimmedQuery}”`;
    if (searchedTotal === 0) return `No emails match “${trimmedQuery}”`;
    return `${searchedTotal.toLocaleString()} result${searchedTotal === 1 ? "" : "s"} for “${trimmedQuery}”`;
  }, [deferredSearchQuery, searchLoading, searchOpen, searchedTotal]);

  if (isAuthenticated === null && !hasAuthSignal) {
    return (
      <div className="relative h-full bg-radius-bg-primary">
        <DragRegion />
      </div>
    );
  }

  if (!hasAuthSignal) {
    return (
      <div className="relative h-full bg-radius-bg-primary">
        <DragRegion />
        <Onboarding
          onConnect={handleConnect}
          error={syncStatus.status === "error" ? syncStatus.error : undefined}
        />
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <div className="relative flex h-full bg-radius-bg-primary overflow-hidden">
      <DragRegion />
      <aside
        className="sidebar-panel h-full border-r border-radius-border-subtle bg-radius-bg-primary will-change-transform"
        data-open={sidebarOpen}
      >
        <InboxList
          messages={visibleMessages}
          total={visibleTotal}
          selectedId={selectedMessageId}
          onSelect={handleSelectMessage}
          syncStatus={syncStatus}
          heading={searchActive ? "Search Results" : "Inbox"}
          detail={searchMeta ?? undefined}
          loading={searchLoading}
          emptyMessage={
            searchActive
              ? `No emails match “${deferredSearchQuery.trim()}”`
              : undefined
          }
        />
      </aside>
      <main className="flex-1 min-w-0 h-full">
        <ReaderView
          message={selectedMessage}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={handleOpenSidebar}
        />
      </main>
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen} modal={false}>
        <DialogContent className="w-full max-w-xl p-0 overflow-hidden border-0 bg-transparent shadow-none">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search for commands and actions in Radius.
          </DialogDescription>
          <CommandK onSearchEmails={handleOpenSearch} />
        </DialogContent>
      </Dialog>
      <EmailSearchSpotlight
        open={searchOpen}
        query={searchDraft}
        resultCount={searchedTotal}
        loading={searchLoading}
        onChangeQuery={setSearchDraft}
        onClose={handleCloseSearch}
        onSubmit={handleSubmitSearch}
      />

      {/* Minimal sync indicator — bottom left, never blocks */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
        <InAppNewMailToast
          message={newMailToast}
          onOpen={handleOpenNewMailToast}
          onDismiss={dismissNewMailToast}
        />
        <NotificationPermissionPrompt
          visible={notificationPromptVisible}
          mode={notificationPromptMode}
          onRequestPermission={requestNotificationPermission}
          onOpenSettings={openNotificationSettings}
          onDismiss={dismissNotificationPrompt}
        />
      </div>
      <SyncPill syncStatus={syncStatus} notice={gmailSyncNotice} />
      </div>
    </ThemeProvider>
  );
}

function EmailSearchSpotlight({
  open,
  query,
  resultCount,
  loading,
  onChangeQuery,
  onClose,
  onSubmit,
}: {
  open: boolean;
  query: string;
  resultCount: number;
  loading: boolean;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);

    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-9 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[420px] border border-radius-border-subtle bg-radius-bg-primary">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="shrink-0 select-none text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            /
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
                event.preventDefault();
                inputRef.current?.select();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Search email"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-radius-text-primary outline-none placeholder:text-radius-text-muted font-[family-name:var(--font-family-sans)]"
          />
          {query.trim() ? (
            <span className="shrink-0 text-[10px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
              {loading ? "..." : `${resultCount.toLocaleString()}`}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-radius-text-muted transition-colors hover:text-radius-text-primary"
            aria-label="Close email search"
          >
            <span className="text-[15px] leading-none">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DragRegion() {
  return (
    <div
      className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-9 z-50"
      style={
        {
          appRegion: "drag",
          WebkitAppRegion: "drag",
        } as CSSProperties
      }
    />
  );
}

function NotificationPermissionPrompt({
  visible,
  mode,
  onRequestPermission,
  onOpenSettings,
  onDismiss,
}: {
  visible: boolean;
  mode: "default" | "followup";
  onRequestPermission: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-auto max-w-[280px] rounded-2xl border border-radius-border-subtle bg-radius-bg-primary/94 px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.12)] backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-radius-bg-secondary text-radius-accent">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
            <path d="M10 17a2 2 0 0 0 4 0" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
              Turn on new mail alerts
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-[-2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
              aria-label="Dismiss notification prompt"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-[1.5] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {mode === "followup"
              ? "If alerts only land in Notification Center, open Notifications settings and set Radius to Banners so new mail pops up while the app is open."
              : "Enable native alerts so Radius can notify you when new email arrives while the app is open."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void onRequestPermission();
              }}
              className="inline-flex items-center rounded-full bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover"
            >
              {mode === "followup" ? "Try again" : "Enable alerts"}
            </button>
            {mode === "followup" ? (
              <button
                type="button"
                onClick={() => {
                  void onOpenSettings();
                }}
                className="inline-flex items-center rounded-full border border-radius-border-subtle bg-radius-bg-secondary px-3 py-1.5 text-[11px] font-medium text-radius-text-primary transition-colors hover:border-radius-border hover:bg-radius-bg-primary"
              >
                Open settings
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InAppNewMailToast({
  message,
  onOpen,
  onDismiss,
}: {
  message: Message | null;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  if (!message) {
    return null;
  }

  const sender = parseAddressLabel(message.from);

  return (
    <div className="pointer-events-auto w-[320px] rounded-[22px] border border-radius-border-subtle bg-radius-bg-primary/96 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all duration-300 ease-out">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-[18px] bg-radius-bg-secondary/70 px-3 py-3 text-left transition-colors duration-200 hover:bg-radius-bg-secondary"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-radius-accent font-[family-name:var(--font-family-sans)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-radius-accent" />
            New mail
          </div>
          <p className="mt-2 truncate text-[14px] text-radius-text-primary font-[family-name:var(--font-family-serif)]">
            {sender.name}
          </p>
          <p className="mt-1 truncate text-[12px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
            {message.subject || message.snippet || "Open to read"}
          </p>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          aria-label="Dismiss new mail alert"
        >
          <XIcon size={12} />
        </button>
      </div>
    </div>
  );
}

function SyncPill({
  syncStatus,
  notice,
}: {
  syncStatus: ReturnType<typeof useSyncStatus>;
  notice: string | null;
}) {
  if (syncStatus.status !== "syncing" && !notice) return null;

  const current = syncStatus.progress?.current ?? 0;
  const total = syncStatus.progress?.total ?? 0;
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-radius-border-subtle bg-radius-bg-secondary/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
      {syncStatus.status === "syncing" ? (
        <svg
          className="animate-spin text-radius-text-muted shrink-0"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-radius-accent" />
      )}
      <span className="text-[11px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
        {notice ??
          (total > 0
            ? `${pct}% · ${current.toLocaleString()}/${total.toLocaleString()}`
            : "Syncing")}
      </span>
    </div>
  );
}

export default App;
