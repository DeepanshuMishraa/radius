import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox, useInboxSearch, useMessage, useAccounts } from "./hooks/useInbox";
import type { Message } from "./hooks/useInbox";
import { CommandK } from "@/components/cmd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";
import { EmailSearchSpotlight } from "@/components/search-spotlight";
import { DragRegion } from "@/components/drag-region";
import { ComposeEmailDialog, type ContactOption } from "@/components/compose";
import { NotificationPermissionPrompt } from "@/components/notification-prompt";
import { UpdateNotification } from "@/components/update-notification";
import { SyncPill } from "@/components/sync-pill";
import { AboutDialog } from "@/components/about";
import { AddAccountDialog } from "@/components/add-account";
import {
  X,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import { Toaster, toast } from "sonner";
import { radiusRpc } from "./lib/rpc";
import type {
  ComposeContactSuggestion,
  ComposeStatusMessage,
  LocalReleaseInfo,
  SyncMode,
  UpdateInfo,
} from "../shared/types";

const INBOX_PAGE_STEP = 500;
const INITIAL_INBOX_LIMIT = 3000;
type MailboxKind = "inbox" | "sent" | "drafts" | "trash";

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
  const composeToastTimersRef = useRef<number[]>([]);
  const [mailboxView, setMailboxView] = useState<MailboxKind>("inbox");
  const [mailboxMessages, setMailboxMessages] = useState<Record<Exclude<MailboxKind, "inbox">, Message[]>>({
    sent: [],
    drafts: [],
    trash: [],
  });
  const [composeSuggestions, setComposeSuggestions] = useState<ComposeContactSuggestion[]>([]);

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
  const visibleMessages = searchActive
    ? mergedSearchMessages
    : mailboxView === "inbox"
      ? mergedInboxMessages
      : mailboxMessages[mailboxView];
  const visibleTotal = searchActive
    ? searchedTotal
    : mailboxView === "inbox"
      ? total
      : mailboxMessages[mailboxView].length;
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

    for (const suggestion of composeSuggestions) {
      if (items.length >= 24) break;
      pushContact(suggestion.label, suggestion.source === "history" ? "recent" : suggestion.source);
    }

    return items;
  }, [accounts, activeAccount, composeSuggestions, mergedInboxMessages, selectedMessage]);

  useEffect(() => {
    void radiusRpc.request
      .getComposeSuggestions({})
      .then((result) => {
        setComposeSuggestions(result.contacts);
      })
      .catch((error) => {
        console.error("Failed to load compose suggestions:", error);
      });
  }, [activeAccount]);

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
    const handleComposeStatus = (message: ComposeStatusMessage) => {
      if (message.status === "send_sent") {
        const timer = window.setTimeout(() => {
          toast.success("Email sent");
          composeToastTimersRef.current = composeToastTimersRef.current.filter(
            (id) => id !== timer,
          );
        }, 250);
        composeToastTimersRef.current.push(timer);
      } else if (message.status === "send_failed") {
        toast.error(message.error ?? "Send failed");
      }
    };

    radiusRpc.addMessageListener("composeStatusChanged", handleComposeStatus);
    return () => {
      for (const timer of composeToastTimersRef.current) {
        window.clearTimeout(timer);
      }
      composeToastTimersRef.current = [];
      radiusRpc.removeMessageListener("composeStatusChanged", handleComposeStatus);
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

  const handleOpenMailbox = useCallback(async (mailbox: Exclude<MailboxKind, "inbox">) => {
    setCmdOpen(false);
    setSearchOpen(false);
    setSidebarOpen(true);
    setMailboxView(mailbox);
    try {
      const result = await radiusRpc.request.getMailboxMessages({ mailbox, limit: 100 });
      setMailboxMessages((current) => ({
        ...current,
        [mailbox]: result.messages,
      }));
      if (result.messages[0]) {
        setSelectedMessageId(result.messages[0].id);
        setSidebarOpen(false);
      }
    } catch (error) {
      console.error(`Failed to load ${mailbox}:`, error);
      toast.error(`Failed to load ${mailbox}`);
    }
  }, []);

  const handleShowInbox = useCallback(() => {
    setCmdOpen(false);
    setSearchOpen(false);
    setMailboxView("inbox");
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
          heading={
            searchActive
              ? "Search Results"
              : mailboxView === "inbox"
                ? "Inbox"
                : mailboxView === "sent"
                  ? "Sent"
                  : mailboxView === "drafts"
                    ? "Drafts"
                    : "Trash"
          }
          detail={searchMeta ?? undefined}
          loading={searchLoading}
          onReachEnd={searchActive || mailboxView !== "inbox" ? undefined : handleLoadMoreInbox}
          emptyMessage={
            searchActive
              ? `No emails match “${deferredSearchQuery.trim()}”`
              : mailboxView === "inbox"
                ? undefined
                : `No ${mailboxView} emails`
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
            onShowMailbox={handleOpenMailbox}
            onShowInbox={handleShowInbox}
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
            background: "var(--radius-bg-primary)",
            color: "var(--radius-text-primary)",
            borderColor: "var(--radius-border-subtle)",
          },
          className: "font-[family-name:var(--font-family-sans)] antialiased shadow-lg",
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

export default App;
