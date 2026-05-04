import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import type { CSSProperties } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox, useInboxSearch, useMessage, useAccounts } from "./hooks/useInbox";
import type { Message } from "./hooks/useInbox";
import { CommandK } from "@/components/cmd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";
import {
  X,
  Bell,
  EnvelopeSimple,
  ArrowCircleUp,
} from "@phosphor-icons/react";
import { Toaster, toast } from "sonner";
import { radiusRpc } from "./lib/rpc";
import type { SyncMode, UpdateInfo } from "../shared/types";

const INBOX_PAGE_STEP = 500;
const INITIAL_INBOX_LIMIT = 3000;

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
  const [selectedSyncMode, setSelectedSyncMode] = useState<SyncMode | null>(null);
  const [inboxLimit, setInboxLimit] = useState(INITIAL_INBOX_LIMIT);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [accountSwitching, setAccountSwitching] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountMode, setAddAccountMode] = useState<SyncMode | null>(null);

  const { isAuthenticated, startOAuth } = useAuth();
  const { accounts, activeAccount, refresh: refreshAccounts } = useAccounts();
  const syncStatus = useSyncStatus();

  useEffect(() => {
    if (cmdOpen) {
      void refreshAccounts();
    }
  }, [cmdOpen, refreshAccounts]);
  const { messages, total } = useInbox(
    inboxLimit,
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
    const handleUpdateStatus = (info: UpdateInfo) => {
      setUpdateInfo(info);
      if (info.updateReady) {
        setUpdateDownloaded(true);
      }
    };

    radiusRpc.addMessageListener("updateStatus", handleUpdateStatus);
    return () => {
      radiusRpc.removeMessageListener("updateStatus", handleUpdateStatus);
    };
  }, []);

  useEffect(() => {
    const handleNewMail = (incomingMessage: Message) => {
      const sender = parseAddressLabel(incomingMessage.from);
      toast.custom(
        (t) => (
          <button
            type="button"
            onClick={() => {
              setSelectedMessageId(incomingMessage.id);
              setSidebarOpen(false);
              toast.dismiss(t);
            }}
            className="group pointer-events-auto relative w-[300px] overflow-hidden rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 text-left shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all duration-200 hover:shadow-[0_12px_40px_rgba(0,0,0,0.16)] hover:border-radius-border"
          >
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-radius-border-subtle">
              <div className="toast-progress h-full bg-radius-accent/40" />
            </div>
            <div className="flex items-start gap-3 p-3.5 pb-4">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-radius-accent-subtle">
                <EnvelopeSimple weight="fill" size={14} className="text-radius-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-radius-accent font-[family-name:var(--font-family-sans)]">
                    New mail
                  </span>
                </div>
                <p className="mt-1 truncate text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-serif)]">
                  {sender.name}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
                  {incomingMessage.subject || incomingMessage.snippet || "Open to read"}
                </p>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    toast.dismiss(t);
                  }
                }}
                className="mt-[-2px] inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-radius-text-muted opacity-0 transition-all duration-150 hover:bg-radius-bg-secondary hover:text-radius-text-primary group-hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={12} weight="bold" />
              </div>
            </div>
          </button>
        ),
        { duration: 6500 }
      );
    };

    radiusRpc.addMessageListener("newMail", handleNewMail);
    return () => {
      radiusRpc.removeMessageListener("newMail", handleNewMail);
    };
  }, []);

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

  const handleConnect = useCallback(
    async (syncMode: SyncMode) => {
      setSelectedSyncMode(syncMode);
      await startOAuth(syncMode);
    },
    [startOAuth]
  );

  const handleLoadMoreInbox = useCallback(() => {
    setInboxLimit((current) => {
      if (current >= total) return current;
      return Math.min(current + INBOX_PAGE_STEP, total);
    });
  }, [total]);

  useEffect(() => {
    if (total === 0) return;
    setInboxLimit((current) =>
      current >= total ? current : Math.min(Math.max(current, INITIAL_INBOX_LIMIT), total)
    );
  }, [total]);

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

  const handleCheckForUpdates = useCallback(async () => {
    setCmdOpen(false);
    try {
      const result = await radiusRpc.request.checkForUpdate({});

      if (result.error) {
        console.error("❌ Update check returned error:", result.error);
        return;
      }

      if (result.updateAvailable && !result.updateReady) {
        console.log(`⬇️  Update v${result.version} available — downloading...`);
        const downloadResult = await radiusRpc.request.downloadUpdate({});
        if (!downloadResult.success) {
          console.error("❌ Download failed:", downloadResult.error);
        } else {
          console.log("✅ Update download started");
        }
      } else if (result.updateReady) {
        console.log("✅ Update already downloaded and ready");
      } else {
        console.log("📦 App is up to date");
      }
    } catch (err) {
      console.error("Manual update check failed:", err);
    }
  }, []);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchDraft("");
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    try {
      const result = await radiusRpc.request.downloadUpdate({});
      if (!result.success) {
        console.error("Download update failed:", result.error);
      }
    } catch (err) {
      console.error("Download update error:", err);
    }
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    try {
      const result = await radiusRpc.request.applyUpdate({});
      if (!result.success) {
        console.error("Apply update failed:", result.error);
      }
    } catch (err) {
      console.error("Apply update error:", err);
    }
  }, []);

  const dismissUpdateNotification = useCallback(() => {
    setUpdateInfo(null);
  }, []);

  const handleSwitchAccount = useCallback(
    async (email: string) => {
      if (email === activeAccount) {
        setCmdOpen(false);
        return;
      }
      setSwitchTarget(email);
      setAccountSwitching(true);
      setCmdOpen(false);
      try {
        await radiusRpc.request.switchAccount({ email });
        window.location.reload();
      } catch (err) {
        console.error("Failed to switch account:", err);
        setAccountSwitching(false);
      }
    },
    [activeAccount]
  );

  const handleAddAccount = useCallback(() => {
    setCmdOpen(false);
    setAddAccountOpen(true);
  }, []);

  const handleConnectNewAccount = useCallback(
    async (syncMode: SyncMode) => {
      setAddAccountMode(syncMode);
      setAddAccountOpen(false);
      await startOAuth(syncMode);
    },
    [startOAuth]
  );

  const handleCloseAddAccount = useCallback(() => {
    setAddAccountOpen(false);
    setAddAccountMode(null);
    void refreshAccounts();
  }, [refreshAccounts]);

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
          selectedMode={selectedSyncMode}
          onSelectMode={setSelectedSyncMode}
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
          onReachEnd={searchActive ? undefined : handleLoadMoreInbox}
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
          <CommandK
            onSearchEmails={handleOpenSearch}
            onCheckForUpdates={handleCheckForUpdates}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={handleAddAccount}
            accounts={accounts}
            activeAccount={activeAccount}
          />
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
        <UpdateNotification
          updateInfo={updateInfo}
          updateDownloaded={updateDownloaded}
          onDownload={handleDownloadUpdate}
          onApply={handleApplyUpdate}
          onDismiss={dismissUpdateNotification}
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
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "transparent",
            border: "none",
            boxShadow: "none",
            padding: 0,
          },
        }}
      />
      {accountSwitching && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-radius-bg-primary animate-in fade-in duration-200">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-radius-accent border-t-transparent" />
            <p className="text-sm text-radius-text-primary font-[family-name:var(--font-family-sans)]">
              Switching to {switchTarget}...
            </p>
          </div>
        </div>
      )}
      <AddAccountDialog
        open={addAccountOpen}
        onClose={handleCloseAddAccount}
        onConnect={handleConnectNewAccount}
        selectedMode={addAccountMode}
        onSelectMode={setAddAccountMode}
      />
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
    <div className="pointer-events-none fixed inset-x-0 top-11 z-50 flex justify-center px-4">
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
      className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-11 z-50"
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
  if (!visible) return null;

  return (
    <div className="toast pointer-events-auto w-[300px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <Bell
          weight="fill"
          size={18}
          className="mt-0.5 shrink-0 text-radius-accent"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-radius-text-primary leading-snug font-[family-name:var(--font-family-sans)]">
            {mode === "followup"
              ? "Set Radius to Banners"
              : "Turn on new mail alerts"}
          </p>
          <p className="mt-1 text-[11px] leading-[1.5] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {mode === "followup"
              ? "Open Notifications settings and set Radius to Banners so new mail pops up."
              : "Enable native alerts so Radius can notify you when new email arrives."}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-[-2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          aria-label="Dismiss"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-radius-border-subtle px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => void onRequestPermission()}
          className="inline-flex items-center rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover"
        >
          {mode === "followup" ? "Try again" : "Enable alerts"}
        </button>
        {mode === "followup" && (
          <button
            type="button"
            onClick={() => void onOpenSettings()}
            className="inline-flex items-center rounded-lg border border-radius-border-subtle bg-transparent px-3 py-1.5 text-[11px] font-medium text-radius-text-secondary transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          >
            Open settings
          </button>
        )}
      </div>
    </div>
  );
}

function UpdateNotification({
  updateInfo,
  updateDownloaded,
  onDownload,
  onApply,
  onDismiss,
}: {
  updateInfo: UpdateInfo | null;
  updateDownloaded: boolean;
  onDownload: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  if (!updateInfo || (!updateInfo.updateAvailable && !updateInfo.updateReady)) {
    return null;
  }

  return (
    <div className="toast pointer-events-auto w-[300px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <ArrowCircleUp
          weight="fill"
          size={18}
          className="mt-0.5 shrink-0 text-radius-accent"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-medium text-radius-text-primary leading-snug font-[family-name:var(--font-family-sans)]">
              {updateDownloaded
                ? `Radius ${updateInfo.version} ready`
                : `Radius ${updateInfo.version} available`}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-[-2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
              aria-label="Dismiss"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-[1.5] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {updateDownloaded
              ? "Downloaded and ready to install. The app will restart automatically."
              : "Download now to get the latest improvements and fixes."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-radius-border-subtle px-3.5 py-2.5">
        {updateDownloaded ? (
          <button
            type="button"
            onClick={() => void onApply()}
            className="inline-flex items-center rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover"
          >
            Install & Restart
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onDownload()}
            className="inline-flex items-center rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover"
          >
            Download
          </button>
        )}
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
  if (syncStatus.status !== "syncing" && !notice && !syncStatus.fullSyncPending) return null;

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
          (syncStatus.fullSyncPending && syncStatus.status !== "syncing"
            ? "Full migration in progress. Older mail will keep syncing while Radius is open."
            : total > 0
              ? `${pct}% · ${current.toLocaleString()}/${total.toLocaleString()}`
              : "Syncing")}
      </span>
    </div>
  );
}

function AddAccountDialog({
  open,
  onClose,
  onConnect,
  selectedMode,
  onSelectMode,
}: {
  open: boolean;
  onClose: () => void;
  onConnect: (mode: SyncMode) => void;
  selectedMode: SyncMode | null;
  onSelectMode: (mode: SyncMode) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-radius-bg-primary/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-[400px] rounded-2xl border border-radius-border-subtle bg-radius-bg-primary p-6 shadow-[0_16px_48px_rgba(0,0,0,0.16)] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            Add Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
            aria-label="Close"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <p className="mb-5 text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          Connect another Gmail account to Radius.
        </p>

        <div className="mb-6 grid gap-2">
          <button
            type="button"
            onClick={() => onSelectMode("recent")}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-200 ${
              selectedMode === "recent"
                ? "border-radius-accent bg-radius-bg-secondary"
                : "border-radius-border-subtle hover:bg-radius-bg-secondary/60"
            }`}
          >
            <div className="text-left">
              <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
                Recent emails
              </p>
              <p className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                Fetch latest 3,000 emails
              </p>
            </div>
            <span
              className={`inline-flex h-4 w-4 shrink-0 rounded-full border ${
                selectedMode === "recent"
                  ? "border-radius-accent bg-radius-accent"
                  : "border-radius-border-subtle"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => onSelectMode("all")}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-200 ${
              selectedMode === "all"
                ? "border-radius-accent bg-radius-bg-secondary"
                : "border-radius-border-subtle hover:bg-radius-bg-secondary/60"
            }`}
          >
            <div className="text-left">
              <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
                All emails
              </p>
              <p className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                Full migration in background
              </p>
            </div>
            <span
              className={`inline-flex h-4 w-4 shrink-0 rounded-full border ${
                selectedMode === "all"
                  ? "border-radius-accent bg-radius-accent"
                  : "border-radius-border-subtle"
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (selectedMode) {
              onConnect(selectedMode);
            }
          }}
          disabled={!selectedMode}
          className="w-full rounded-xl bg-radius-accent px-4 py-2.5 text-[13px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:bg-radius-bg-secondary disabled:text-radius-text-muted disabled:cursor-not-allowed font-[family-name:var(--font-family-sans)]"
        >
          Connect Gmail
        </button>
      </div>
    </div>
  );
}

export default App;
