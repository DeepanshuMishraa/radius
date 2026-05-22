import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
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
  headerAction?: ReactNode;
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

function CategoryBadge({ category }: { category: EmailCategory }) {
  if (category === "regular" || category === "personal") return null;

  const labels: Record<string, string> = {
    important: "Important",
    promotional: "Promo",
    social: "Social",
    updates: "Update",
    forums: "Forum",
    spam: "Spam",
  };

  const label = labels[category];
  if (!label) return null;

  return (
    <span 
      className="inline-flex shrink-0 items-center justify-center rounded px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-[0.16em] text-radius-text-muted border border-radius-border-subtle/60 bg-radius-bg-secondary/40 backdrop-blur-sm opacity-30 group-hover/row:opacity-100 hover:opacity-100! transition-opacity duration-200"
      title={category}
    >
      {label}
    </span>
  );
}

function ReadIndicator({ isRead }: { isRead: boolean }) {
  if (isRead) return (
    <span className="w-2 h-2 shrink-0 rounded-full bg-transparent" />
  );

  return (
    <span
      className="w-2 h-2 shrink-0 rounded-full bg-radius-accent shadow-[0_0_8px_rgba(var(--radius-accent),0.4)]"
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
        group/row flex items-start gap-4 h-[92px] px-6 py-4 cursor-pointer select-none overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${isSelected ? "border-l-[3px] border-l-radius-accent bg-radius-bg-secondary/70 shadow-sm" : "border-l-[3px] border-l-transparent hover:bg-radius-bg-secondary/30"}
        ${!message.isRead && !isSelected ? "bg-radius-bg-secondary/10" : ""}
      `}
    >
      {/* Unread dot column */}
      <div className="mt-[5px] shrink-0">
        <ReadIndicator isRead={message.isRead} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Top line: sender + badges + date pill */}
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <div className="min-w-0 flex items-center gap-2">
            <span
              className={`truncate text-[13.5px] font-[family-name:var(--font-family-sans)] ${
                message.isRead
                  ? "font-medium text-radius-text-primary/80"
                  : "font-semibold text-radius-text-primary"
              }`}
            >
              {senderName}
            </span>
            <CategoryBadge category={message.category} />
          </div>
          <span className={`shrink-0 text-[11px] font-[family-name:var(--font-family-sans)] ${
            message.isRead ? 'text-radius-text-muted/70' : 'text-radius-text-muted'
          }`}>
            {formatDateShort(message.internalDate)}
          </span>
        </div>

        {/* Subject */}
        <p
          className={`text-[13px] truncate font-[family-name:var(--font-family-sans)] leading-snug ${
            message.isRead
              ? "text-radius-text-primary/70 font-normal"
              : "text-radius-text-primary font-medium"
          }`}
        >
          {message.subject}
        </p>

        {/* Snippet */}
        <p
          className={`text-[12.5px] truncate font-[family-name:var(--font-family-sans)] leading-relaxed mt-0.5 ${
            message.isRead
              ? "text-radius-text-muted/50"
              : "text-radius-text-secondary/70"
          }`}
        >
          {message.snippet}
        </p>
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
  headerAction,
}: InboxListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,
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
          {headerAction}
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
