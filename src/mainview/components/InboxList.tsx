import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { Message, SyncStatus } from "../hooks/useInbox";
import { useAvatarCache } from "../hooks/useAvatarCache";
import { Avatar } from "./Avatar";


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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Email from ${senderName}: ${message.subject}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`
        relative h-[82px] px-3 py-3 cursor-pointer select-none overflow-hidden transition-colors duration-150 ease-out border-b border-radius-border-subtle group
        ${isSelected ? "bg-radius-bg-secondary" : "hover:bg-radius-bg-secondary/40 active:bg-radius-bg-secondary/60 bg-transparent"}
      `}
    >
      <div className={`flex gap-2.5 h-full transition-transform duration-200 ease-out ${!isSelected ? 'group-active:scale-[0.99]' : ''}`}>
        <div className="w-2 flex justify-center shrink-0">
          {!message.isRead && (
            <div className="w-2 h-2 rounded-full bg-radius-accent mt-1.5" />
          )}
        </div>

        <Avatar name={senderName} email={senderEmail} cachedUrl={avatarUrl} size={36} />
        
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-0.5">
            <span className={`truncate text-[14px] tracking-[-0.01em] font-[family-name:var(--font-family-sans)] ${message.isRead ? "text-radius-text-primary" : "text-radius-text-primary font-semibold"}`}>
              {senderName}
            </span>
            <span className={`shrink-0 text-[11px] font-[family-name:var(--font-family-sans)] ml-2 ${message.isRead ? "text-radius-text-muted" : "text-radius-accent font-medium"}`}>
              {formatDateShort(message.internalDate)}
            </span>
          </div>
          <p className={`text-[13px] tracking-[-0.01em] truncate mb-0.5 font-[family-name:var(--font-family-sans)] ${message.isRead ? "text-radius-text-secondary" : "text-radius-text-primary font-medium"}`}>
            {message.subject}
          </p>
          <p className={`text-[13px] tracking-[-0.01em] truncate font-[family-name:var(--font-family-sans)] ${message.isRead ? "text-radius-text-muted" : "text-radius-text-secondary"}`}>
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
  detail: _detail,
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
    estimateSize: () => 82,
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-radius-border-subtle bg-radius-bg-primary/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 text-radius-text-secondary">
          <span className="text-[13px] font-semibold text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            {heading}
          </span>
        </div>
        <span className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)] tabular-nums font-medium">
          {total.toLocaleString()}
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-10 h-10 rounded-full border border-radius-border-subtle flex items-center justify-center mb-4 text-radius-text-muted bg-radius-bg-secondary/30">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
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
