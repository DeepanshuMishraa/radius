import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox, useInboxSearch, useMessage, useAccounts } from "./hooks/useInbox";
import type { Message } from "./hooks/useInbox";
import { CommandK } from "@/components/cmd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmailSearchSpotlight } from "@/components/search-spotlight";
import { DragRegion } from "@/components/drag-region";
import { ComposeEmailDialog, type ComposeIntent, type ContactOption } from "@/components/compose";
import { NotificationPermissionPrompt } from "@/components/notification-prompt";
import { UpdateNotification } from "@/components/update-notification";
import { SyncPill } from "@/components/sync-pill";
import { SyncDetailsDialog } from "@/components/sync-details";
import { AboutDialog } from "@/components/about";
import { AddAccountDialog } from "@/components/add-account";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete01Icon,
  Home01Icon,
  Mail01Icon,
  MailSend01Icon,
  PencilEdit01Icon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Toaster, toast } from "sonner";
import { useHotkey } from "@tanstack/react-hotkeys";
import { radiusRpc } from "./lib/rpc";
import type {
  ComposeContactSuggestion,
  PendingDeleteStatusMessage,
  ComposeStatusMessage,
  LocalReleaseInfo,
  SyncHistoryEntry,
  SyncMode,
  UpdateInfo,
} from "../shared/types";

const INBOX_PAGE_STEP = 500;
const INITIAL_INBOX_LIMIT = 3000;
type MailboxKind = "inbox" | "sent" | "drafts" | "trash";
type MessageSort = "newest" | "oldest" | "sender" | "subject";
type ReadFilter = "all" | "unread" | "read";
type AttachmentFilter = "all" | "attachments";
type CategoryFilter = "all" | "important" | "promotional" | "social" | "updates" | "forums" | "spam";

const MAILBOX_SHORTCUTS: Record<MailboxKind, string> = {
  inbox: "G I",
  sent: "G S",
  drafts: "G D",
  trash: "G T",
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

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

function ThemedToaster() {
  const { appearance } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={appearance}
      toastOptions={{
        style: {
          background: "var(--radius-bg-primary)",
          color: "var(--radius-text-primary)",
          borderColor: "var(--radius-border-subtle)",
        },
        className: "font-[family-name:var(--font-family-sans)] antialiased shadow-lg",
      }}
    />
  );
}

function MailboxRail({
  activeMailbox,
  searchActive,
  onShowInbox,
  onShowMailbox,
  onOpenSearch,
}: {
  activeMailbox: MailboxKind;
  searchActive: boolean;
  onShowInbox: () => void;
  onShowMailbox: (mailbox: Exclude<MailboxKind, "inbox">) => void;
  onOpenSearch: () => void;
}) {
  const items: Array<{
    mailbox: MailboxKind;
    label: string;
    shortcut: string;
    icon: typeof Home01Icon;
  }> = [
    { mailbox: "inbox", label: "Inbox", shortcut: MAILBOX_SHORTCUTS.inbox, icon: Home01Icon },
    { mailbox: "sent", label: "Sent", shortcut: MAILBOX_SHORTCUTS.sent, icon: MailSend01Icon },
    { mailbox: "drafts", label: "Drafts", shortcut: MAILBOX_SHORTCUTS.drafts, icon: PencilEdit01Icon },
    { mailbox: "trash", label: "Trash", shortcut: MAILBOX_SHORTCUTS.trash, icon: Delete01Icon },
  ];

  return (
    <nav
      aria-label="Mailbox navigation"
      className="flex w-[74px] shrink-0 flex-col items-center gap-2 border-r border-radius-border-subtle bg-radius-bg-primary px-2 pb-3 pt-14"
    >
      {items.map((item) => {
        const isActive = !searchActive && activeMailbox === item.mailbox;
        const onClick =
          item.mailbox === "inbox"
            ? onShowInbox
            : () => onShowMailbox(item.mailbox as Exclude<MailboxKind, "inbox">);

        return (
          <button
            key={item.mailbox}
            type="button"
            onClick={onClick}
            aria-current={isActive ? "page" : undefined}
            className={`group flex w-full flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[10px] font-medium tracking-[0.08em] transition-colors ${
              isActive
                ? "bg-radius-bg-secondary text-radius-text-primary"
                : "text-radius-text-muted hover:bg-radius-bg-secondary/70 hover:text-radius-text-primary"
            }`}
            title={`${item.label} (${item.shortcut})`}
          >
            <HugeiconsIcon icon={item.icon} size={16} />
            <span className="uppercase">{item.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onOpenSearch}
        className={`mt-2 flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed px-2 py-3 text-[10px] font-medium tracking-[0.08em] transition-colors ${
          searchActive
            ? "border-radius-accent/40 bg-radius-accent-subtle text-radius-text-primary"
            : "border-radius-border-subtle text-radius-text-muted hover:border-radius-border hover:text-radius-text-primary"
        }`}
        title="Search (/ or Cmd+F)"
      >
        <HugeiconsIcon icon={Search01Icon} size={16} />
        <span className="uppercase">Search</span>
      </button>
    </nav>
  );
}

function FirstRunGuide({
  visible,
  onDismiss,
  onCompose,
  onSearch,
  onCommands,
}: {
  visible: boolean;
  onDismiss: () => void;
  onCompose: () => void;
  onSearch: () => void;
  onCommands: () => void;
}) {
  if (!visible) return null;

  return (
    <section className="pointer-events-auto absolute right-6 top-16 z-20 w-[320px] rounded-[22px] border border-radius-border-subtle bg-radius-bg-primary/94 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-radius-accent">
            First steps
          </p>
          <h2 className="mt-1 text-[18px] font-medium text-radius-text-primary font-[family-name:var(--font-family-serif)]">
            Radius stays quiet, but it still has a few fast paths worth knowing.
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          aria-label="Dismiss tips"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} />
        </button>
      </div>

      <div className="mt-4 space-y-2 text-[12px] text-radius-text-secondary">
        <button type="button" onClick={onCompose} className="flex w-full items-center justify-between rounded-2xl bg-radius-bg-secondary/70 px-3 py-2 text-left transition-colors hover:bg-radius-bg-secondary">
          <span>Compose a message</span>
          <span className="text-radius-text-muted">C</span>
        </button>
        <button type="button" onClick={onSearch} className="flex w-full items-center justify-between rounded-2xl bg-radius-bg-secondary/70 px-3 py-2 text-left transition-colors hover:bg-radius-bg-secondary">
          <span>Search across your mail</span>
          <span className="text-radius-text-muted">/</span>
        </button>
        <button type="button" onClick={onCommands} className="flex w-full items-center justify-between rounded-2xl bg-radius-bg-secondary/70 px-3 py-2 text-left transition-colors hover:bg-radius-bg-secondary">
          <span>Open commands, accounts, and themes</span>
          <span className="text-radius-text-muted">Cmd+K</span>
        </button>
      </div>
    </section>
  );
}

function App() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
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

  const [isDownloading, setIsDownloading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [accountSwitching, setAccountSwitching] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountMode, setAddAccountMode] = useState<SyncMode | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<LocalReleaseInfo | null>(null);
  const [composeIntent, setComposeIntent] = useState<ComposeIntent | null>(null);
  const composeToastTimersRef = useRef<number[]>([]);
  const activeMailboxRef = useRef<Exclude<MailboxKind, "inbox"> | null>(null);
  const mailboxShortcutStateRef = useRef<{ armed: boolean; timer: number | null }>({
    armed: false,
    timer: null,
  });
  const [mailboxView, setMailboxView] = useState<MailboxKind>("inbox");
  const [mailboxMessages, setMailboxMessages] = useState<Record<Exclude<MailboxKind, "inbox">, Message[]>>({
    sent: [],
    drafts: [],
    trash: [],
  });
  const [composeSuggestions, setComposeSuggestions] = useState<ComposeContactSuggestion[]>([]);
  const [welcomeGuideDismissed, setWelcomeGuideDismissed] = useState(false);
  const [sortOrder, setSortOrder] = useState<MessageSort>("newest");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [attachmentFilter, setAttachmentFilter] = useState<AttachmentFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);

  const { isAuthenticated, startOAuth } = useAuth();
  const { accounts, activeAccount, refresh: refreshAccounts, removeAccount } = useAccounts();
  const syncStatus = useSyncStatus();

  useEffect(() => {
    if (cmdOpen) {
      void refreshAccounts();
    }
  }, [cmdOpen, refreshAccounts]);

  useHotkey(
    "Mod+B",
    (e) => {
      e.preventDefault();
      setSidebarOpen((prev) => !prev);
    },
    { ignoreInputs: true }
  );

  const { messages, total, refresh: refreshInbox } = useInbox(
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
  const baseVisibleMessages = searchActive
    ? mergedSearchMessages
    : mailboxView === "inbox"
      ? mergedInboxMessages
      : mailboxMessages[mailboxView];
  const visibleMessages = useMemo(() => {
    const filtered = baseVisibleMessages.filter((message) => {
      if (readFilter === "read" && !message.isRead) return false;
      if (readFilter === "unread" && message.isRead) return false;
      if (attachmentFilter === "attachments" && message.attachments.length === 0) return false;
      if (categoryFilter !== "all" && message.category !== categoryFilter) return false;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (sortOrder === "oldest") return left.internalDate - right.internalDate;
      if (sortOrder === "sender") {
        return (left.from || "").localeCompare(right.from || "", undefined, { sensitivity: "base" });
      }
      if (sortOrder === "subject") {
        return (left.subject || "").localeCompare(right.subject || "", undefined, { sensitivity: "base" });
      }
      return right.internalDate - left.internalDate;
    });
    return sorted;
  }, [attachmentFilter, baseVisibleMessages, categoryFilter, readFilter, sortOrder]);
  const visibleTotal = visibleMessages.length;
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
        toast.error("Contact suggestions unavailable", {
          description: "Radius can still send mail, but recent recipients could not be loaded.",
        });
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
                  <HugeiconsIcon icon={Mail01Icon} size={12} className="text-radius-accent" />
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
              <HugeiconsIcon icon={Cancel01Icon} size={11} className="text-radius-text-muted" />
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
    setWelcomeGuideDismissed(
      window.localStorage.getItem("radius.first-run-guide.dismissed") === "true"
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

  useEffect(() => {
    if (!syncDetailsOpen) return;
    void radiusRpc.request.getSyncHistory({ limit: 12 }).then((result) => {
      setSyncHistory(result.events);
    }).catch((error) => {
      console.error("Failed to load sync history:", error);
    });
  }, [syncDetailsOpen, syncStatus.lastSyncAt, syncStatus.status]);

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

  const handleSelectMessage = useCallback((id: string, multi: boolean, range: boolean) => {
    if (multi || range) {
      setSelectedMessageIds((prev) => {
        const next = new Set(prev);
        if (range && lastSelectedId) {
          const startIndex = visibleMessages.findIndex((m) => m.id === lastSelectedId);
          const endIndex = visibleMessages.findIndex((m) => m.id === id);
          if (startIndex !== -1 && endIndex !== -1) {
            const start = Math.min(startIndex, endIndex);
            const end = Math.max(startIndex, endIndex);
            for (let i = start; i <= end; i++) {
              next.add(visibleMessages[i].id);
            }
          }
        } else {
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }
        return next;
      });
      setLastSelectedId(id);
    } else {
      setSelectedMessageId(id);
      setSelectedMessageIds(new Set([id]));
      setLastSelectedId(id);
      setSidebarOpen(false);
    }
  }, [visibleMessages, lastSelectedId]);

  const handleToggleSelectMessage = useCallback((id: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
  }, []);

  const currentMessageIndex = useMemo(() => {
    if (!selectedMessageId) return -1;
    return visibleMessages.findIndex((m) => m.id === selectedMessageId);
  }, [visibleMessages, selectedMessageId]);

  useEffect(() => {
    if (!selectedMessageId) return;
    if (visibleMessages.some((message) => message.id === selectedMessageId)) return;
    setSelectedMessageId(visibleMessages[0]?.id ?? null);
  }, [selectedMessageId, visibleMessages]);

  useEffect(() => {
    setSelectedMessageIds((current) => {
      const visibleSet = new Set(visibleMessages.map((message) => message.id));
      const next = new Set(Array.from(current).filter((id) => visibleSet.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleMessages]);

  const handlePrevMessage = useCallback(() => {
    if (currentMessageIndex <= 0) return;
    const prev = visibleMessages[currentMessageIndex - 1];
    if (prev) {
      setSelectedMessageId(prev.id);
    }
  }, [currentMessageIndex, visibleMessages]);

  const handleNextMessage = useCallback(() => {
    if (currentMessageIndex < 0 || currentMessageIndex >= visibleMessages.length - 1) return;
    const next = visibleMessages[currentMessageIndex + 1];
    if (next) {
      setSelectedMessageId(next.id);
    }
  }, [currentMessageIndex, visibleMessages]);

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

  const selectedMessages = useMemo(
    () => visibleMessages.filter((message) => selectedMessageIds.has(message.id)),
    [selectedMessageIds, visibleMessages]
  );

  const updateMessagesReadState = useCallback(
    async (messageIds: string[], read: boolean) => {
      if (messageIds.length === 0) return;

      setMessageOverrides((prev) => {
        const next = { ...prev };
        for (const id of messageIds) {
          next[id] = {
            ...(next[id] ?? {}),
            isRead: read,
          };
        }
        return next;
      });

      const action = read ? radiusRpc.request.markMessageRead : radiusRpc.request.markMessageUnread;
      const failures: string[] = [];

      for (const id of messageIds) {
        try {
          const result = await action({ id });
          if (!result.success) {
            failures.push(id);
            if (result.code === "reauth_required") {
              setGmailSyncNotice(result.error ?? "Reconnect Gmail to finish syncing message state.");
            }
          } else {
            failedReadRef.current.delete(id);
          }
        } catch (error) {
          console.error(`Failed to mark message ${read ? "read" : "unread"}:`, error);
          failures.push(id);
        }
      }

      if (failures.length > 0) {
        setMessageOverrides((prev) => {
          const next = { ...prev };
          for (const id of failures) {
            delete next[id];
          }
          return next;
        });
        if (failures.length === 1) {
          toast.custom((t) => (
            <div className="toast pointer-events-auto w-[340px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold text-radius-text-primary">
                    Could not mark message as {read ? "read" : "unread"}
                  </div>
                  <div className="text-[11px] text-radius-text-muted">
                    Gmail did not confirm the change.
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-radius-text-primary px-2.5 py-1 text-[11px] font-medium text-radius-bg-primary"
                  onClick={() => {
                    toast.dismiss(t);
                    void updateMessagesReadState([failures[0]], read);
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          ));
        } else {
          toast.error(`Could not update ${failures.length} messages`);
        }
        return;
      }

      toast.success(
        messageIds.length === 1
          ? `Marked as ${read ? "read" : "unread"}`
          : `${messageIds.length} messages marked ${read ? "read" : "unread"}`
      );
    },
    []
  );

  const handleToggleImportant = useCallback(async () => {
    if (!selectedMessage) return;
    const nextImportant = !selectedMessage.isImportant;

    setMessageOverrides((prev) => ({
      ...prev,
      [selectedMessage.id]: {
        ...(prev[selectedMessage.id] ?? {}),
        isImportant: nextImportant,
      },
    }));

    try {
      const result = await radiusRpc.request.toggleMessageImportant({
        id: selectedMessage.id,
        important: nextImportant,
      });
      if (!result.success) {
        throw new Error(result.error ?? "Failed to update importance");
      }
      toast.success(nextImportant ? "Pinned as important" : "Removed from important");
    } catch (error) {
      console.error("Toggle important failed:", error);
      setMessageOverrides((prev) => {
        const next = { ...prev };
        delete next[selectedMessage.id];
        return next;
      });
      toast.custom((t) => (
        <div className="toast pointer-events-auto w-[340px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold text-radius-text-primary">
                Could not update importance
              </div>
              <div className="text-[11px] text-radius-text-muted">
                Try again or reconnect Gmail if permissions changed.
              </div>
            </div>
            <button
              type="button"
              className="rounded-md bg-radius-text-primary px-2.5 py-1 text-[11px] font-medium text-radius-bg-primary"
              onClick={() => {
                toast.dismiss(t);
                void handleToggleImportant();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ));
    }
  }, [selectedMessage]);

  const handleMarkSelectedRead = useCallback(async () => {
    await updateMessagesReadState(
      selectedMessages.map((message) => message.id),
      true
    );
  }, [selectedMessages, updateMessagesReadState]);

  const handleMarkSelectedUnread = useCallback(async () => {
    await updateMessagesReadState(
      selectedMessages.map((message) => message.id),
      false
    );
  }, [selectedMessages, updateMessagesReadState]);

  const handleOpenInGmail = useCallback(async () => {
    if (!selectedMessage) return;
    const url = `https://mail.google.com/mail/u/${activeAccount ?? 0}/#all/${selectedMessage.threadId}`;
    try {
      await radiusRpc.request.openExternalUrl({ url });
    } catch (err) {
      console.error("Open in Gmail error:", err);
      toast.error("Failed to open Gmail");
    }
  }, [selectedMessage, activeAccount]);

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
    setComposeIntent({ kind: "compose" });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleOpenSearch();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && key === "f") {
        e.preventDefault();
        handleOpenSearch();
        return;
      }

      if (key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleOpenCompose();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpenCompose, handleOpenSearch]);

  const refreshMailbox = useCallback(
    async (mailbox: Exclude<MailboxKind, "inbox">) => {
      const result = await radiusRpc.request.getMailboxMessages({ mailbox, limit: 100 });
      setMailboxMessages((current) => ({
        ...current,
        [mailbox]: result.messages,
      }));
      return result.messages;
    },
    [],
  );

  const handleOpenMailbox = useCallback(async (mailbox: Exclude<MailboxKind, "inbox">) => {
    activeMailboxRef.current = mailbox;
    setCmdOpen(false);
    setSearchOpen(false);
    setSidebarOpen(true);
    setMailboxView(mailbox);
    setSelectedMessageId(null);
    try {
      await refreshMailbox(mailbox);
      if (activeMailboxRef.current !== mailbox) return;
    } catch (error) {
      console.error(`Failed to load ${mailbox}:`, error);
      toast.error(`Failed to load ${mailbox}`);
    }
  }, [refreshMailbox]);

  const handleShowInbox = useCallback(() => {
    setCmdOpen(false);
    setSearchOpen(false);
    setMailboxView("inbox");
    setSidebarOpen(true);
    setSelectedMessageId(null);
    setSelectedMessageIds(new Set());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      const normalized = e.key.toLowerCase();
      const hotkeyMap: Record<string, MailboxKind> = {
        i: "inbox",
        s: "sent",
        d: "drafts",
        t: "trash",
      };

      if (normalized === "g") {
        mailboxShortcutStateRef.current.armed = true;
        if (mailboxShortcutStateRef.current.timer !== null) {
          window.clearTimeout(mailboxShortcutStateRef.current.timer);
        }
        mailboxShortcutStateRef.current.timer = window.setTimeout(() => {
          mailboxShortcutStateRef.current.armed = false;
          mailboxShortcutStateRef.current.timer = null;
        }, 550);
        return;
      }

      if (!mailboxShortcutStateRef.current.armed || !hotkeyMap[normalized]) return;

      e.preventDefault();
      mailboxShortcutStateRef.current.armed = false;
      if (mailboxShortcutStateRef.current.timer !== null) {
        window.clearTimeout(mailboxShortcutStateRef.current.timer);
        mailboxShortcutStateRef.current.timer = null;
      }

      const mailbox = hotkeyMap[normalized];
      if (mailbox === "inbox") {
        handleShowInbox();
      } else {
        void handleOpenMailbox(mailbox);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      if (mailboxShortcutStateRef.current.timer !== null) {
        window.clearTimeout(mailboxShortcutStateRef.current.timer);
        mailboxShortcutStateRef.current.timer = null;
      }
      window.removeEventListener("keydown", handler);
    };
  }, [handleOpenMailbox, handleShowInbox]);

  const refreshVisibleMailboxData = useCallback(async () => {
    await refreshInbox();
    if (mailboxView !== "inbox") {
      await refreshMailbox(mailboxView);
    }
    if (mailboxView !== "trash") {
      await refreshMailbox("trash");
    }
    if (mailboxView !== "sent") {
      await refreshMailbox("sent");
    }
  }, [mailboxView, refreshInbox, refreshMailbox]);

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    setComposeIntent({ kind: "reply", messageId: selectedMessage.id });
  }, [selectedMessage]);

  const handleForward = useCallback(() => {
    if (!selectedMessage) return;
    setComposeIntent({ kind: "forward", messageId: selectedMessage.id });
  }, [selectedMessage]);

  const handleDelete = useCallback(async () => {
    if (!selectedMessage) return;
    const currentIndex = visibleMessages.findIndex((message) => message.id === selectedMessage.id);
    const fallbackMessage =
      visibleMessages[currentIndex + 1] ?? visibleMessages[currentIndex - 1] ?? null;
    try {
      const result = await radiusRpc.request.queueDeleteMessage({ messageId: selectedMessage.id });
      if (!result.success) {
        toast.error(result.error ?? "Delete failed");
        return;
      }
      setMailboxMessages((current) => ({
        sent: current.sent.filter((message) => message.id !== selectedMessage.id),
        drafts: current.drafts.filter((message) => message.id !== selectedMessage.id),
        trash: [
          {
            ...selectedMessage,
            isInbox: false,
            isSent: false,
            isDraft: false,
            isTrash: true,
          },
          ...current.trash.filter((message) => message.id !== selectedMessage.id),
        ],
      }));
      setSelectedMessageId(fallbackMessage?.id ?? null);
      await refreshVisibleMailboxData();
      if (result.operationId && result.undoDeadlineAt) {
        const duration = Math.max(0, result.undoDeadlineAt - Date.now());
        toast.custom(
          (t) => (
            <div className="toast pointer-events-auto w-[320px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-[12px] font-semibold text-radius-text-primary">
                    Moved to trash
                  </div>
                  <div className="text-[11px] text-radius-text-muted">
                    Undo within 10 seconds.
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-radius-text-primary px-2.5 py-1 text-[11px] font-medium text-radius-bg-primary"
                  onClick={async () => {
                    const undo = await radiusRpc.request.undoDeleteMessage({
                      operationId: result.operationId!,
                    });
                    if (!undo.success) {
                      toast.error(undo.error ?? "Undo failed");
                      return;
                    }
                    toast.dismiss(t);
                    await refreshVisibleMailboxData();
                    toast.success("Message restored");
                  }}
                >
                  Undo
                </button>
              </div>
              <div
                className="toast-progress h-[2px] bg-radius-accent"
                style={{ animationDuration: `${duration}ms` }}
              />
            </div>
          ),
          { duration: Math.max(duration, 1000) },
        );
      } else {
        toast.success(mailboxView === "trash" ? "Message deleted permanently" : "Message moved to trash");
      }
    } catch (error) {
      console.error("Delete message failed:", error);
      toast.error("Delete failed");
    }
  }, [mailboxView, refreshVisibleMailboxData, selectedMessage, visibleMessages]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedMessages.length === 0) return;

    const ids = selectedMessages.map((message) => message.id);
    let deleted = 0;

    for (const id of ids) {
      try {
        const result = await radiusRpc.request.queueDeleteMessage({ messageId: id });
        if (result.success) {
          deleted += 1;
        }
      } catch (error) {
        console.error("Bulk delete failed:", error);
      }
    }

    await refreshVisibleMailboxData();
    setSelectedMessageIds(new Set());
    if (deleted === 0) {
      toast.error("Delete failed");
      return;
    }

    toast.success(
      deleted === 1 ? "Message moved to trash" : `${deleted} messages moved to trash`
    );
  }, [refreshVisibleMailboxData, selectedMessages]);

  const handleEmptyTrash = useCallback(async () => {
    try {
      const result = await radiusRpc.request.emptyTrash({});
      if (!result.success) {
        toast.error(result.error ?? "Failed to empty trash");
        return;
      }
      await refreshVisibleMailboxData();
      if (mailboxView === "trash") {
        setSelectedMessageId(null);
      }
      toast.success(
        result.deletedCount && result.deletedCount > 0
          ? `Deleted ${result.deletedCount} message${result.deletedCount === 1 ? "" : "s"}`
          : "Trash is already empty",
      );
    } catch (error) {
      console.error("Empty trash failed:", error);
      toast.error("Failed to empty trash");
    }
  }, [mailboxView, refreshVisibleMailboxData]);

  useEffect(() => {
    const handleComposeStatus = (message: ComposeStatusMessage) => {
      if (message.status === "send_sent") {
        void refreshVisibleMailboxData();
        const timer = window.setTimeout(() => {
          toast.success("Message sent", {
            description: "Your email has been successfully sent.",
          });
          composeToastTimersRef.current = composeToastTimersRef.current.filter(
            (id) => id !== timer,
          );
        }, 250);
        composeToastTimersRef.current.push(timer);
      } else if (message.status === "send_failed") {
        toast.custom((t) => (
          <div className="toast pointer-events-auto w-[360px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-radius-text-primary">
                  Message could not be sent
                </div>
                <div className="text-[11px] text-radius-text-muted">
                  {message.error ?? "Radius kept your draft so you can fix and retry."}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md bg-radius-text-primary px-2.5 py-1 text-[11px] font-medium text-radius-bg-primary"
                onClick={() => {
                  toast.dismiss(t);
                  setComposeIntent({ kind: "session", sessionId: message.sessionId });
                }}
              >
                Resume draft
              </button>
            </div>
          </div>
        ));
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
  }, [refreshVisibleMailboxData]);

  useEffect(() => {
    const handlePendingDeleteStatus = (message: PendingDeleteStatusMessage) => {
      if (message.status === "delete_failed") {
        toast.custom((t) => (
          <div className="toast pointer-events-auto w-[340px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-radius-text-primary">
                  Delete failed
                </div>
                <div className="text-[11px] text-radius-text-muted">
                  {message.error ?? "Radius could not move this message to trash."}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md bg-radius-text-primary px-2.5 py-1 text-[11px] font-medium text-radius-bg-primary"
                onClick={() => {
                  toast.dismiss(t);
                  void radiusRpc.request.queueDeleteMessage({ messageId: message.messageId });
                }}
              >
                Retry
              </button>
            </div>
          </div>
        ));
        void refreshVisibleMailboxData();
      } else if (message.status === "delete_committed" || message.status === "delete_undone") {
        void refreshVisibleMailboxData();
      }
    };

    radiusRpc.addMessageListener("pendingDeleteStatusChanged", handlePendingDeleteStatus);
    return () => {
      radiusRpc.removeMessageListener("pendingDeleteStatusChanged", handlePendingDeleteStatus);
    };
  }, [refreshVisibleMailboxData]);

  const handleCheckForUpdates = useCallback(async () => {
    setCmdOpen(false);
    try {
      const result = await radiusRpc.request.checkForUpdate({});

      if (result.error) {
        console.error("❌ Update check returned error:", result.error);
        return;
      }

      if (result.updateAvailable && !result.updateReady) {
        console.log(`⬇️  Update v${result.version} available - downloading...`);
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
    setSortOrder("newest");
    setReadFilter("all");
    setAttachmentFilter("all");
    setCategoryFilter("all");
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

  const dismissGmailSyncNotice = useCallback(() => {
    setGmailSyncNotice(null);
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
        const result = await radiusRpc.request.switchAccount({ email });
        if (!result.success) {
          throw new Error(result.error ?? "Failed to switch account");
        }
        setSelectedMessageId(null);
        setSelectedMessageIds(new Set());
        setMailboxView("inbox");
        setSearchOpen(false);
        setSearchDraft("");
        await Promise.all([refreshAccounts(), refreshInbox(), refreshMailbox("sent"), refreshMailbox("trash"), refreshMailbox("drafts")]);
        setAccountSwitching(false);
      } catch (err) {
        console.error("Failed to switch account:", err);
        toast.error("Failed to switch account");
        setAccountSwitching(false);
      }
    },
    [activeAccount, refreshAccounts, refreshInbox, refreshMailbox]
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

  const handleResync = useCallback(async () => {
    setCmdOpen(false);
    try {
      const result = await radiusRpc.request.resyncAccount({});
      if (result.success) {
        toast.success("Resync started", {
          description: "Your emails are being re-downloaded in the background.",
        });
      } else {
        toast.error(result.error ?? "Resync failed");
      }
    } catch (err) {
      console.error("Resync error:", err);
      toast.error("Resync failed");
    }
  }, []);

  const handleReconnect = useCallback(async () => {
    setCmdOpen(false);
    if (!activeAccount) {
      toast.error("No active account to reconnect");
      return;
    }
    try {
      const result = await radiusRpc.request.reconnectAccount({ email: activeAccount });
      if (!result.success) {
        toast.error(result.error ?? "Reconnect failed");
      }
    } catch (err) {
      console.error("Reconnect error:", err);
      toast.error("Reconnect failed");
    }
  }, [activeAccount]);

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
    if (visibleMessages.length > 0) {
      setSelectedMessageId(visibleMessages[0].id);
      setSidebarOpen(true);
    }
  }, [visibleMessages]);

  const dismissWelcomeGuide = useCallback(() => {
    setWelcomeGuideDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("radius.first-run-guide.dismissed", "true");
    }
  }, []);

  const searchMeta = useMemo(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    if (!searchOpen) return null;
    if (!trimmedQuery) return "Search sender, subject, snippet, or body text";
    if (searchLoading) return `Searching for "${trimmedQuery}"`;
    if (searchedTotal === 0) return `No emails match "${trimmedQuery}"`;
    return `${searchedTotal.toLocaleString()} result${searchedTotal === 1 ? "" : "s"} for "${trimmedQuery}"`;
  }, [deferredSearchQuery, searchLoading, searchOpen, searchedTotal]);

  const hasActiveFilters =
    sortOrder !== "newest" ||
    readFilter !== "all" ||
    attachmentFilter !== "all" ||
    categoryFilter !== "all";

  const welcomeGuideVisible =
    !welcomeGuideDismissed &&
    Boolean(syncStatus.initialSyncCompletedAt) &&
    !selectedMessage &&
    !cmdOpen &&
    !composeIntent;

  const inboxHeaderAction = useMemo(() => {
    if (selectedMessages.length > 0) {
      const allRead = selectedMessages.every((message) => message.isRead);
      const allUnread = selectedMessages.every((message) => !message.isRead);

      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void (allRead ? handleMarkSelectedUnread() : handleMarkSelectedRead())}
            className="rounded-full border border-radius-border-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-radius-text-muted transition-colors hover:border-radius-border hover:text-radius-text-primary"
          >
            {allUnread ? "Mark Read" : allRead ? "Mark Unread" : "Toggle Read"}
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteSelected()}
            className="rounded-full border border-radius-border-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-radius-text-muted transition-colors hover:border-radius-border hover:text-radius-text-primary"
          >
            Delete
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => void refreshVisibleMailboxData()}
        className="inline-flex items-center gap-1.5 rounded-full border border-radius-border-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-radius-text-muted transition-colors hover:border-radius-border hover:text-radius-text-primary"
        title="Refresh mailbox"
      >
        <HugeiconsIcon icon={Refresh01Icon} size={12} />
        Refresh
      </button>
    );
  }, [
    handleDeleteSelected,
    handleMarkSelectedRead,
    handleMarkSelectedUnread,
    refreshVisibleMailboxData,
    selectedMessages,
  ]);

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
      <TooltipProvider>
      <div className="relative flex h-full bg-radius-bg-primary overflow-hidden">
        <DragRegion />
      <a
        href="#radius-reader"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-14 focus:z-[120] focus:rounded-full focus:bg-radius-bg-primary focus:px-3 focus:py-2 focus:text-[12px] focus:text-radius-text-primary"
      >
        Skip to message content
      </a>
      <MailboxRail
        activeMailbox={mailboxView}
        searchActive={searchActive}
        onShowInbox={handleShowInbox}
        onShowMailbox={handleOpenMailbox}
        onOpenSearch={handleOpenSearch}
      />
      <aside
        className="sidebar-panel h-full border-r border-radius-border-subtle bg-radius-bg-primary will-change-transform"
        data-open={sidebarOpen}
      >
        <InboxList
          messages={visibleMessages}
          total={visibleTotal}
          selectedId={selectedMessageId}
          selectedIds={selectedMessageIds}
          onSelect={handleSelectMessage}
          onToggleSelect={handleToggleSelectMessage}
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
          detail={
            searchOpen
              ? searchMeta ?? undefined
              : hasActiveFilters
                ? `${visibleTotal.toLocaleString()} refined result${visibleTotal === 1 ? "" : "s"}`
                : undefined
          }
          loading={searchLoading}
          onReachEnd={searchActive || mailboxView !== "inbox" ? undefined : handleLoadMoreInbox}
          emptyMessage={
            searchActive
              ? `No emails match "${deferredSearchQuery.trim()}"`
              : mailboxView === "inbox"
                ? undefined
                : `No ${mailboxView} emails`
          }
          toolbar={
            searchOpen || hasActiveFilters ? (
              <EmailSearchSpotlight
                open={searchOpen || hasActiveFilters}
                query={searchDraft}
                resultCount={searchActive ? searchedTotal : visibleTotal}
                loading={searchLoading}
                onChangeQuery={setSearchDraft}
                onClose={handleCloseSearch}
                onSubmit={handleSubmitSearch}
                sortOrder={sortOrder}
                readFilter={readFilter}
                attachmentFilter={attachmentFilter}
                categoryFilter={categoryFilter}
                onChangeSortOrder={setSortOrder}
                onChangeReadFilter={setReadFilter}
                onChangeAttachmentFilter={setAttachmentFilter}
                onChangeCategoryFilter={setCategoryFilter}
              />
            ) : null
          }
          headerAction={
            mailboxView === "trash" && selectedMessages.length === 0 ? (
              <div className="flex items-center gap-1.5">
                {inboxHeaderAction}
                <button
                  type="button"
                  onClick={() => void handleEmptyTrash()}
                  className="rounded-full border border-radius-border-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-radius-text-muted transition-colors hover:border-radius-border hover:text-radius-text-primary"
                >
                  Empty Trash
                </button>
              </div>
            ) : (
              inboxHeaderAction
            )
          }
        />
      </aside>
      <main id="radius-reader" className="flex-1 min-w-0 h-full">
        <FirstRunGuide
          visible={welcomeGuideVisible}
          onDismiss={dismissWelcomeGuide}
          onCompose={handleOpenCompose}
          onSearch={handleOpenSearch}
          onCommands={() => setCmdOpen(true)}
        />
        <ReaderView
          message={selectedMessage}
          mailbox={searchActive ? "inbox" : mailboxView}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={handleOpenSidebar}
          onPrev={handlePrevMessage}
          onNext={handleNextMessage}
          onReply={handleReply}
          onForward={handleForward}
          onDelete={handleDelete}
          onToggleRead={() =>
            void updateMessagesReadState(
              selectedMessage
                ? [selectedMessage.id]
                : [],
              Boolean(selectedMessage?.isRead ? false : true)
            )
          }
          onToggleImportant={handleToggleImportant}
          onOpenInGmail={handleOpenInGmail}
        />
      </main>
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen} modal={false}>
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-[720px] sm:max-w-[720px] p-0 overflow-hidden border-0 ring-0 bg-transparent shadow-none pt-[10vh]"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
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
            onClose={() => setCmdOpen(false)}
            onResync={handleResync}
            onReconnect={handleReconnect}
            accounts={accounts}
            activeAccount={activeAccount}
          />
        </DialogContent>
      </Dialog>
      <ComposeEmailDialog
        open={composeIntent !== null}
        onClose={() => setComposeIntent(null)}
        fromAccount={activeAccountRecord}
        accounts={accounts}
        contacts={composeContacts}
        intent={composeIntent ?? { kind: "compose" }}
      />

      {/* Minimal sync indicator - bottom left, never blocks */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
        <UpdateNotification
          updateInfo={updateInfo}
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
      <SyncPill
        syncStatus={syncStatus}
        notice={gmailSyncNotice}
        onDismissNotice={gmailSyncNotice ? dismissGmailSyncNotice : undefined}
        onRefresh={() => void refreshVisibleMailboxData()}
        onOpenDetails={() => setSyncDetailsOpen(true)}
      />
      <SyncDetailsDialog
        open={syncDetailsOpen}
        onOpenChange={setSyncDetailsOpen}
        syncMode={syncStatus.syncMode}
        syncError={gmailSyncNotice ?? syncStatus.error}
        events={syncHistory}
        onRefresh={() => void refreshVisibleMailboxData()}
        onResync={() => void handleResync()}
        onReconnect={() => void handleReconnect()}
      />
      <ThemedToaster />
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
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
