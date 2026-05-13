import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback, useEffect, useMemo } from "react";
import type { Message, SyncStatus, EmailCategory } from "../hooks/useInbox";
import { useAvatarCache } from "../hooks/useAvatarCache";
import { Avatar } from "./Avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkBadge01Icon, CheckmarkSquare01Icon } from "@hugeicons/core-free-icons";

interface InboxListProps {
  messages: Message[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  syncStatus: SyncStatus;
  onReachEnd?: () => void;
  heading?: string;
  detail?: string;
  loading?: boolean;
  emptyMessage?: string;
}

function formatDateShort(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }
}

const CATEGORY_DOT: Record<EmailCategory, string> = {
  important: "#c4a35a",
  promotional: "#a35ac4",
  social: "#5a7dc4",
  updates: "#5a8c6f",
  forums: "#c47d5a",
  spam: "#c45a5a",
  personal: "#5aa8c4",
  regular: "transparent",
};

function CategoryDot({ category }: { category: EmailCategory }) {
  const color = CATEGORY_DOT[category];
  if (color === "transparent") return null;
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: 5,
        height: 5,
        backgroundColor: color,
        marginRight: 6,
        marginBottom: 1,
      }}
      title={category}
    />
  );
}

function ReadIndicator({ isRead }: { isRead: boolean }) {
  if (isRead) return null;

  return (
    <span
      className="inline-block rounded-full shrink-0 bg-radius-accent"
      style={{
        width: 7,
        height: 7,
        marginLeft: 8,
      }}
      title="Unread"
      aria-label="Unread"
    />
  );
}

function EmailRow({
  message,
  isSelected,
  onClick,
  avatarUrl,
}: {
  message: Message;
  isSelected: boolean;
  onClick: () => void;
  avatarUrl: string | null;
}) {
  const senderName = message.from?.split("<")[0].trim() || message.from || "";
  const senderEmail = message.from?.match(/<([^>]+)>/)?.[1] || message.from || "";

  return (
    <div
      onClick={onClick}
      className={`
        h-[110px] px-6 py-4 cursor-pointer select-none overflow-hidden transition-colors border-b border-radius-border-subtle
        ${isSelected ? "bg-radius-bg-secondary" : "hover:bg-radius-bg-secondary/50 bg-radius-bg-primary"}
      `}
    >
      <div className="flex gap-4">
        <Avatar name={senderName} email={senderEmail} cachedUrl={avatarUrl} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`truncate text-[15px] font-[family-name:var(--font-family-sans)] ${message.isRead ? "text-radius-text-primary font-medium" : "text-radius-text-primary font-bold"}`}>
                {senderName}
              </span>
              <HugeiconsIcon icon={CheckmarkBadge01Icon} className="text-[#3b82f6] shrink-0" size={15} />
            </div>
            <span className="shrink-0 text-[12px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
              {formatDateShort(message.internalDate)}
            </span>
          </div>
          <p className={`text-[13px] truncate mb-1 font-[family-name:var(--font-family-sans)] ${message.isRead ? "text-radius-text-secondary font-normal" : "text-radius-text-primary font-medium"}`}>
            {message.subject}
          </p>
          <p className="text-[13px] text-radius-text-muted truncate leading-[1.4] font-[family-name:var(--font-family-sans)]">
            {message.snippet}
          </p>
        </div>
      </div>
    </div>
  );
}

export function InboxList({
  messages,
  total,
  selectedId,
  onSelect,
  syncStatus,
  onReachEnd,
  heading = "Inbox",
  detail,
  loading = false,
  emptyMessage,
}: InboxListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Collect all sender emails for batch avatar fetching
  const senderEmails = useMemo(() => 
    messages.map(m => m.from?.match(/<([^>]+)>/)?.[1] || m.from || "").filter(Boolean),
    [messages]
  );
  const { getAvatarUrl } = useAvatarCache(senderEmails);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    getItemKey: (index) => messages[index]?.id ?? index,
    overscan: 5,
  });

  const handleMessageClick = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect]
  );

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (
      onReachEnd &&
      lastVirtualItem &&
      messages.length < total &&
      !loading &&
      lastVirtualItem.index >= messages.length - 20
    ) {
      onReachEnd();
    }
  }, [lastVirtualItem?.index, loading, messages.length, onReachEnd, total]);

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-radius-border-subtle bg-radius-bg-primary z-10">
        <div className="flex items-center gap-3 text-radius-text-secondary">
          <HugeiconsIcon icon={CheckmarkSquare01Icon} size={18} />
          <span className="text-[14px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            {heading}
          </span>
        </div>
        <span className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-sans)] tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-10 h-10 rounded-2xl border border-radius-border-subtle flex items-center justify-center mb-4">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-radius-text-muted"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <p className="text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {emptyMessage ?? (syncStatus.status === "syncing" ? "Fetching your emails" : "No messages")}
          </p>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto bg-radius-bg-primary">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const message = messages[virtualItem.index];
              const senderEmail = message.from?.match(/<([^>]+)>/)?.[1] || message.from || "";
              return (
                <div
                  key={message.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <EmailRow
                    message={message}
                    isSelected={selectedId === message.id}
                    onClick={() => handleMessageClick(message.id)}
                    avatarUrl={getAvatarUrl(senderEmail)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
