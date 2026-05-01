import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback, useEffect } from "react";
import type { Message, SyncStatus, EmailCategory } from "../hooks/useInbox";

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
}: {
  message: Message;
  isSelected: boolean;
  onClick: () => void;
}) {
  const senderName = message.from?.split("<")[0].trim() || message.from || "";

  return (
    <div
      onClick={onClick}
      className={`
        h-[104px] px-5 py-3.5 cursor-pointer select-none overflow-hidden transition-colors duration-80
        ${isSelected ? "border-l-[2px] border-l-radius-accent bg-radius-bg-secondary" : "border-l-[2px] border-l-transparent hover:bg-radius-bg-secondary"}
        ${!message.isRead ? "bg-radius-bg-secondary/40" : ""}
      `}
    >
      {/* Top line: sender + date pill */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <span
          className={`min-w-0 flex flex-1 items-center text-[13px] truncate pr-3 font-[family-name:var(--font-family-sans)] ${
            message.isRead
              ? "font-medium text-radius-text-primary"
              : "font-semibold text-radius-text-primary"
          }`}
        >
          <CategoryDot category={message.category} />
          <span className="truncate">{senderName}</span>
          <ReadIndicator isRead={message.isRead} />
        </span>
        <span className="shrink-0 text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)] border border-radius-border-subtle rounded-full px-2 py-0.5">
          {formatDateShort(message.internalDate)}
        </span>
      </div>

      {/* Subject */}
      <p
        className={`text-[13px] truncate mb-0.5 font-[family-name:var(--font-family-sans)] ${
          message.isRead
            ? "text-radius-text-primary/88 font-normal"
            : "text-radius-text-primary font-semibold"
        }`}
      >
        {message.subject}
      </p>

      {/* Snippet */}
      <p
        className={`text-[12px] truncate leading-[1.4] font-[family-name:var(--font-family-sans)] ${
          message.isRead
            ? "text-radius-text-muted"
            : "text-radius-text-secondary"
        }`}
      >
        {message.snippet}
      </p>
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

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
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
    <div className="flex flex-col h-full bg-radius-bg-primary pt-11">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-radius-border-subtle">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold text-radius-text-muted uppercase tracking-[1px] font-[family-name:var(--font-family-sans)]">
            {heading}
          </span>
          {detail ? (
            <span className="block mt-1 text-[11px] text-radius-text-muted/90 truncate font-[family-name:var(--font-family-sans)]">
              {detail}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {loading ? (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-radius-accent animate-pulse" />
          ) : null}
          <span className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {total.toLocaleString()}
          </span>
        </div>
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
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const message = messages[virtualItem.index];
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
