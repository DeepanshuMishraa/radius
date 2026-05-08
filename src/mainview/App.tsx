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
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Bell,
  EnvelopeSimple,
  ArrowCircleUp,
  CaretDown,
  CheckCircle,
  Plus,
  Sparkle,
  UserPlus,
} from "@phosphor-icons/react";
import { Toaster, toast } from "sonner";
import { radiusRpc } from "./lib/rpc";
import type { SyncMode, UpdateInfo, LocalReleaseInfo } from "../shared/types";

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

interface ContactOption {
  name: string;
  email: string;
  label: string;
  source: "recent" | "account" | "manual";
}

function parseContactOption(
  address: string | null | undefined,
  source: ContactOption["source"]
): ContactOption | null {
  const parsed = parseAddressLabel(address);
  const fallbackEmail =
    typeof address === "string" && address.includes("@") && !parsed.email
      ? address.trim()
      : "";
  const email = (parsed.email || fallbackEmail).trim();
  if (!email) return null;
  const name = parsed.name?.trim() || email;
  return {
    name,
    email,
    label: name === email ? email : `${name} <${email}>`,
    source,
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [accountSwitching, setAccountSwitching] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountMode, setAddAccountMode] = useState<SyncMode | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<LocalReleaseInfo | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const { isAuthenticated, startOAuth } = useAuth();
  const { accounts, activeAccount, refresh: refreshAccounts, removeAccount } = useAccounts();
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
  const activeAccountRecord = useMemo(
    () => accounts.find((account) => account.email === activeAccount) ?? null,
    [accounts, activeAccount]
  );
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
  const composeContacts = useMemo(() => {
    const seen = new Set<string>();
    const items: ContactOption[] = [];

    const pushContact = (raw: string | null | undefined, source: ContactOption["source"]) => {
      const contact = parseContactOption(raw, source);
      if (!contact) return;
      const normalizedEmail = contact.email.toLowerCase();
      if (activeAccount && normalizedEmail === activeAccount.toLowerCase()) return;
      if (seen.has(normalizedEmail)) return;
      seen.add(normalizedEmail);
      items.push(contact);
    };

    if (selectedMessage?.from) {
      pushContact(selectedMessage.from, "recent");
    }

    for (const message of mergedInboxMessages) {
      pushContact(message.from, "recent");
      if (items.length >= 16) break;
    }

    for (const account of accounts) {
      if (items.length >= 16) break;
      pushContact(`${account.name} <${account.email}>`, "account");
    }

    return items;
  }, [accounts, activeAccount, mergedInboxMessages, selectedMessage]);

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
          <div className="group pointer-events-auto relative w-[280px] overflow-hidden rounded-xl border border-radius-border-subtle bg-radius-bg-primary/95 shadow-lg backdrop-blur-xl transition-all duration-200 hover:shadow-xl hover:border-radius-border">
            <button
              type="button"
              className="w-full text-left"
              onClick={() => {
                setSelectedMessageId(incomingMessage.id);
                setSidebarOpen(false);
                toast.dismiss(t);
              }}
            >
              <div className="flex items-start gap-2.5 p-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-radius-accent-subtle">
                  <EnvelopeSimple weight="fill" size={12} className="text-radius-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-radius-accent font-[family-name:var(--font-family-sans)]">
                    New mail
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-serif)]">
                    {sender.name}
                  </p>
                  <p className="truncate text-[12px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
                    {incomingMessage.subject || incomingMessage.snippet || "Open to read"}
                  </p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => toast.dismiss(t)}
              className="absolute top-2.5 right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-radius-text-muted opacity-0 transition-all duration-150 hover:bg-radius-bg-secondary hover:text-radius-text-primary group-hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={11} weight="bold" />
            </button>
          </div>
        ),
        { duration: 6000 }
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

  const handleOpenCompose = useCallback(() => {
    setCmdOpen(false);
    setComposeOpen(true);
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
        setIsDownloading(true);
        try {
          const downloadResult = await radiusRpc.request.downloadUpdate({});
          if (!downloadResult.success) {
            console.error("❌ Download failed:", downloadResult.error);
          } else {
            console.log("✅ Update download started");
          }
        } finally {
          setIsDownloading(false);
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
    setIsDownloading(true);
    try {
      const result = await radiusRpc.request.downloadUpdate({});
      if (!result.success) {
        console.error("Download update failed:", result.error);
        toast.error(result.error ?? "Download failed");
      }
    } catch (err) {
      console.error("Download update error:", err);
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    setIsApplying(true);
    try {
      const result = await radiusRpc.request.applyUpdate({});
      if (!result.success) {
        console.error("Apply update failed:", result.error);
        toast.error(result.error ?? "Restart failed");
        setIsApplying(false);
      }
    } catch (err) {
      console.error("Apply update error:", err);
      toast.error("Restart failed");
      setIsApplying(false);
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

  const handleRemoveAccount = useCallback(
    async (email: string) => {
      setCmdOpen(false);
      try {
        const success = await removeAccount(email);
        if (success) {
          toast.success("Account removed");
          if (accounts.length <= 1 || email === activeAccount) {
            window.location.reload();
          }
        } else {
          toast.error("Failed to remove account");
        }
      } catch (err) {
        console.error("Remove account error:", err);
        toast.error("Failed to remove account");
      }
    },
    [removeAccount, accounts.length, activeAccount]
  );

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

  const handleOpenAbout = useCallback(async () => {
    setCmdOpen(false);
    setAboutOpen(true);
    try {
      const info = await radiusRpc.request.getLocalReleaseInfo({});
      setAboutInfo(info);
    } catch (err) {
      console.error("Failed to get release info:", err);
    }
  }, []);

  const handleCloseAbout = useCallback(() => {
    setAboutOpen(false);
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
            onComposeEmail={handleOpenCompose}
            onCheckForUpdates={handleCheckForUpdates}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
            onAbout={handleOpenAbout}
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
      <ComposeEmailDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        fromAccount={activeAccountRecord}
        contacts={composeContacts}
      />

      {/* Minimal sync indicator — bottom left, never blocks */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
        <UpdateNotification
          updateInfo={updateInfo}
          updateDownloaded={updateDownloaded}
          isDownloading={isDownloading}
          isApplying={isApplying}
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
      <AboutDialog
        open={aboutOpen}
        onClose={handleCloseAbout}
        info={aboutInfo}
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

function ComposeEmailDialog({
  open,
  onClose,
  fromAccount,
  contacts,
}: {
  open: boolean;
  onClose: () => void;
  fromAccount: { email: string; name: string } | null;
  contacts: ContactOption[];
}) {
  const [selectedRecipients, setSelectedRecipients] = useState<ContactOption[]>([]);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pendingAction, setPendingAction] = useState<"draft" | "send" | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<"explorer" | "navigator" | null>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedRecipients([]);
    setRecipientQuery("");
    setSubject("");
    setBody("");
    setPendingAction(null);
    setDraftSavedAt(null);
    setSelectedAgent(null);

    const timer = window.setTimeout(() => {
      recipientInputRef.current?.focus();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [open]);

  const filteredContacts = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    const selectedSet = new Set(selectedRecipients.map((item) => item.email.toLowerCase()));

    return contacts.filter((contact) => {
      if (selectedSet.has(contact.email.toLowerCase())) return false;
      if (!query) return true;
      return (
        contact.name.toLowerCase().includes(query) ||
        contact.email.toLowerCase().includes(query)
      );
    });
  }, [contacts, recipientQuery, selectedRecipients]);

  const addRecipient = useCallback((contact: ContactOption) => {
    setSelectedRecipients((current) => {
      if (current.some((item) => item.email.toLowerCase() === contact.email.toLowerCase())) {
        return current;
      }
      return [...current, contact];
    });
    setRecipientQuery("");
    recipientInputRef.current?.focus();
  }, []);

  const removeRecipient = useCallback((email: string) => {
    setSelectedRecipients((current) =>
      current.filter((item) => item.email.toLowerCase() !== email.toLowerCase())
    );
  }, []);

  const commitManualRecipient = useCallback(() => {
    const value = recipientQuery.trim().replace(/,$/, "");
    if (!value) return;
    if (!isValidEmail(value)) {
      toast.error("Enter a valid email address");
      return;
    }

    addRecipient({
      name: value,
      email: value,
      label: value,
      source: "manual",
    });
  }, [addRecipient, recipientQuery]);

  const handleComposeAction = useCallback(
    async (action: "draft" | "send") => {
      if (!fromAccount?.email) {
        toast.error("Connect a Gmail account before composing");
        return;
      }

      const payload = {
        from: fromAccount.email,
        to: selectedRecipients.map((item) => item.email),
        subject: subject.trim(),
        bodyText: body.trim(),
      };

      setPendingAction(action);
      try {
        const result =
          action === "draft"
            ? await radiusRpc.request.saveDraft(payload)
            : await radiusRpc.request.sendEmail(payload);

        if (!result.success) {
          toast.error(result.error ?? "Something went wrong");
          return;
        }

        if (action === "draft") {
          setDraftSavedAt(Date.now());
          toast.success("Draft saved to Gmail");
          return;
        }

        toast.success("Email sent");
        onClose();
      } catch (error) {
        console.error(`Compose ${action} failed:`, error);
        toast.error(action === "draft" ? "Draft save failed" : "Send failed");
      } finally {
        setPendingAction(null);
      }
    },
    [body, fromAccount, onClose, selectedRecipients, subject]
  );

  if (!open) return null;

  const draftLabel =
    pendingAction === "draft"
      ? "SAVING"
      : draftSavedAt
        ? "SAVED"
        : "DRAFT";
  const canSubmit =
    Boolean(fromAccount?.email) &&
    selectedRecipients.length > 0 &&
    (subject.trim().length > 0 || body.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-[640px] rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <EnvelopeSimple size={18} weight="regular" className="text-gray-700" />
            <h2 className="text-[15px] font-medium text-gray-900">Compose email</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close compose"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-6 pb-5">
          {/* From */}
          <div className="flex items-center gap-3">
            <span className="w-10 text-[13px] text-gray-400">From</span>
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[10px] font-semibold text-blue-600">
                {fromAccount?.name?.slice(0, 1).toUpperCase() ?? "R"}
              </div>
              <span className="text-[13px] text-gray-900">
                {fromAccount?.name || fromAccount?.email || "No active account"}
              </span>
              <CheckCircle size={14} weight="fill" className="text-blue-500" />
            </div>
          </div>

          {/* To */}
          <div className="mt-3 flex items-start gap-3">
            <span className="w-10 pt-1.5 text-[13px] text-gray-400">To</span>
            <div className="flex min-h-[34px] flex-1 flex-wrap items-center gap-1.5">
              {selectedRecipients.map((recipient) => (
                <button
                  key={recipient.email}
                  type="button"
                  onClick={() => removeRecipient(recipient.email)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                  title="Remove recipient"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[9px] font-medium text-gray-600">
                    {(recipient.name || recipient.email).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[12px] text-gray-900">{recipient.name}</span>
                  <CheckCircle size={12} weight="fill" className="text-blue-500" />
                </button>
              ))}

              <div className="flex min-w-[140px] flex-1 items-center gap-1.5">
                <UserPlus size={14} className="text-gray-400 shrink-0" />
                <input
                  ref={recipientInputRef}
                  value={recipientQuery}
                  onChange={(event) => setRecipientQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
                      if (recipientQuery.trim()) {
                        event.preventDefault();
                        commitManualRecipient();
                      }
                    } else if (
                      event.key === "Backspace" &&
                      !recipientQuery &&
                      selectedRecipients.length > 0
                    ) {
                      removeRecipient(selectedRecipients[selectedRecipients.length - 1].email);
                    }
                  }}
                  placeholder="Select person"
                  className="min-w-[100px] flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 h-px bg-gray-100" />

          {/* Agent */}
          <div className="mb-4">
            <span className="text-[13px] text-gray-400">Agent</span>
            <div className="mt-1.5 space-y-0.5">
              <button
                type="button"
                onClick={() => setSelectedAgent("explorer")}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${selectedAgent === "explorer" ? "bg-gray-50" : "hover:bg-gray-50"}`}
              >
                <span className="flex h-7 w-7 items-center justify-center text-[14px]">🧩</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-pink-500">Explorer</span>
                  <span className="text-[13px] text-gray-400">A new adventure</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedAgent("navigator")}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${selectedAgent === "navigator" ? "bg-gray-50" : "hover:bg-gray-50"}`}
              >
                <span className="flex h-7 w-7 items-center justify-center text-[14px]">🧭</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-sky-500">Navigator</span>
                  <span className="text-[13px] text-gray-400">Charting unknown territories</span>
                </div>
              </button>
            </div>
          </div>

          {/* Suggested */}
          <div className="mb-4">
            <span className="text-[13px] text-gray-400">Suggested</span>
            <div className="mt-1">
              {filteredContacts.slice(0, 6).map((contact) => (
                <button
                  key={contact.email}
                  type="button"
                  onClick={() => addRecipient(contact)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
                    {(contact.name || contact.email).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[13px] text-gray-900">{contact.name}</span>
                </button>
              ))}
              {filteredContacts.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 px-2 py-2.5">
                  <p className="text-[11px] text-gray-400">Type any email address to add a recipient.</p>
                </div>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="border-t border-gray-100 pt-3">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              className="h-9 w-full bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>

          {/* Body */}
          <div className="pt-1">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message..."
              className="min-h-[80px] resize-none rounded-lg border-0 bg-transparent px-0 py-2 text-[13px] leading-5 text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 focus-visible:ring-0"
            />
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 opacity-60"
                aria-label="Attachments coming soon"
                title="Attachments coming soon"
              >
                <Plus size={16} />
              </button>
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5">
                <Sparkle size={14} className="text-amber-500" weight="fill" />
                <span className="text-[12px] text-gray-700">Opus 4.5</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                <span className="text-[11px] font-medium tracking-wide text-blue-500">
                  {draftLabel}
                </span>
              </div>

              <div className="inline-flex overflow-hidden rounded-lg bg-gray-900 text-white">
                <button
                  type="button"
                  disabled={!canSubmit || pendingAction !== null}
                  onClick={() => void handleComposeAction("send")}
                  className="inline-flex h-9 items-center gap-2 px-4 text-[13px] font-medium hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === "send" ? (
                    <>
                      <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      <span>Sending</span>
                    </>
                  ) : (
                    <span>Send</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!canSubmit || pendingAction !== null}
                  onClick={() => void handleComposeAction("draft")}
                  className="inline-flex h-9 items-center border-l border-white/10 px-2.5 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Save draft"
                  title="Save draft"
                >
                  {pendingAction === "draft" ? (
                    <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                  ) : (
                    <CaretDown size={12} weight="bold" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  isDownloading,
  isApplying,
  onDownload,
  onApply,
  onDismiss,
}: {
  updateInfo: UpdateInfo | null;
  updateDownloaded: boolean;
  isDownloading: boolean;
  isApplying: boolean;
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
            {isDownloading
              ? "Downloading update…"
              : isApplying
                ? "Restarting to install update…"
                : updateDownloaded
                  ? "Downloaded and ready to install. The app will restart automatically."
                  : "Download now to get the latest improvements and fixes."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-radius-border-subtle px-3.5 py-2.5">
        {updateDownloaded ? (
          <button
            type="button"
            disabled={isApplying}
            onClick={() => void onApply()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isApplying && (
              <svg className="animate-spin text-current" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            <span>Install & Restart</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => void onDownload()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDownloading && (
              <svg className="animate-spin text-current" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            <span>Download</span>
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
  const isInitialSync =
    syncStatus.status === "syncing" &&
    (syncStatus.phase === "initial" || !syncStatus.initialSyncCompletedAt);
  const shouldShow =
    Boolean(notice) || syncStatus.status === "error" || isInitialSync;

  if (!shouldShow) return null;

  const current = syncStatus.progress?.current ?? 0;
  const total = syncStatus.progress?.total ?? 0;
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[18px] border border-radius-border-subtle bg-radius-bg-primary/92 shadow-[0_12px_36px_rgba(0,0,0,0.14)] backdrop-blur-xl">
      <div className="flex items-start gap-3 px-3.5 py-3">
        {syncStatus.status === "error" ? (
          <span className="mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-radius-error" />
        ) : notice ? (
          <span className="mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-radius-accent" />
        ) : (
          <svg
            className="mt-0.5 shrink-0 animate-spin text-radius-accent"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            {syncStatus.status === "error"
              ? "Sync needs attention"
              : notice
                ? "Gmail sync notice"
                : "Bringing your inbox in"}
          </p>
          <p className="mt-1 text-[11px] leading-[1.55] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
            {notice ??
              (syncStatus.status === "error"
                ? syncStatus.error ?? "Radius could not finish syncing."
                : total > 0
                  ? `${pct}% synced • ${current.toLocaleString()} of ${total.toLocaleString()} messages`
                  : "Your first sync is running in the background. You can start reading while the rest lands.")}
          </p>
          {isInitialSync && total > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-radius-bg-tertiary">
              <div
                className="h-full rounded-full bg-radius-accent transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AboutDialog({
  open,
  onClose,
  info,
}: {
  open: boolean;
  onClose: () => void;
  info: LocalReleaseInfo | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-radius-bg-primary/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-[360px] rounded-2xl border border-radius-border-subtle bg-radius-bg-primary p-8 shadow-[0_16px_48px_rgba(0,0,0,0.16)] animate-in zoom-in-95 duration-200 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 inline-flex h-6 w-6 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          aria-label="Close"
        >
          <X size={14} weight="bold" />
        </button>

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-radius-accent-subtle">
          <EnvelopeSimple weight="fill" size={28} className="text-radius-accent" />
        </div>

        <h2 className="text-[18px] font-semibold text-radius-text-primary font-[family-name:var(--font-family-sans)] tracking-tight">
          Radius
        </h2>
        <p className="mt-1 text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          A Minimal and Clean Distraction Free Client
        </p>

        <div className="mt-5 inline-flex items-center rounded-full border border-radius-border-subtle bg-radius-bg-secondary px-3 py-1">
          <span className="text-[11px] font-medium text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
            Version {info?.version ?? "…"}
          </span>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          <span className="inline-flex h-2 w-2 rounded-full bg-radius-accent" />
          <span>Built with care</span>
        </div>
      </div>
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
