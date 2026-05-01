import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox, useInboxSearch, useMessage } from "./hooks/useInbox";
import type { Message } from "./hooks/useInbox";
import { CommandK } from "@/components/cmd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";
import { MagnifyingGlassIcon, ArrowBendDownLeftIcon, XIcon } from "@phosphor-icons/react";
import { radiusRpc } from "./lib/rpc";

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

  const { isAuthenticated, startOAuth } = useAuth();
  const syncStatus = useSyncStatus();
  const { messages, total } = useInbox(
    1000,
    0,
    syncStatus.status === "syncing" ? 2000 : 15000
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
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
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
    <div className="pointer-events-none fixed inset-x-0 top-[52px] z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[500px] rounded-[16px] border border-radius-border-subtle bg-radius-bg-primary/94 shadow-[0_14px_36px_rgba(0,0,0,0.10)] supports-backdrop-filter:backdrop-blur-md">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-radius-bg-secondary text-radius-text-muted">
            <MagnifyingGlassIcon size={13} weight="bold" />
          </div>
          <div className="min-w-0 flex-1">
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
              className="w-full bg-transparent text-[16px] leading-none text-radius-text-primary outline-none placeholder:text-radius-text-muted/85 font-[family-name:var(--font-family-serif)]"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
            aria-label="Close email search"
          >
            <XIcon size={13} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-radius-border-subtle px-3.5 py-2 text-[10px] uppercase tracking-[0.08em] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          <div className="min-w-0 truncate">
            {!query.trim()
              ? "Local inbox search"
              : loading
                ? "Searching..."
                : `${resultCount.toLocaleString()} result${resultCount === 1 ? "" : "s"}`}
          </div>
          <div className="shrink-0 inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowBendDownLeftIcon size={10} />
              Open
            </span>
            <span>Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DragRegion() {
  return (
    <div
      className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-9 z-50"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    />
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
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-radius-bg-secondary/90 backdrop-blur-sm border border-radius-border-subtle shadow-sm">
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
