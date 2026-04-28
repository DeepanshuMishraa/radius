import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback } from "react";
import type { Message, SyncStatus } from "../hooks/useInbox";

interface InboxListProps {
  messages: Message[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  syncStatus: SyncStatus;
}

function formatDate(timestamp: number): string {
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
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
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
  return (
    <div
      onClick={onClick}
      className={`
        flex items-baseline gap-4 px-5 py-3.5 cursor-pointer select-none
        transition-colors duration-80
        ${
          isSelected
            ? "bg-radius-bg-tertiary border-l-[3px] border-radius-accent pl-[17px]"
            : "hover:bg-radius-bg-secondary border-l-[3px] border-transparent pl-5"
        }
      `}
    >
      <span
        className={`text-[13px] min-w-[140px] max-w-[180px] truncate ${
          isSelected ? "font-semibold" : "font-medium"
        } text-radius-text-primary`}
      >
        {message.from.split("<")[0].trim() || message.from}
      </span>

      <span
        className={`text-[13px] flex-1 truncate text-radius-text-secondary ${
          isSelected ? "font-medium" : ""
        }`}
      >
        {message.subject}
      </span>

      <span className="text-xs text-radius-text-muted whitespace-nowrap">
        {formatDate(message.internalDate)}
      </span>
    </div>
  );
}

function SyncIndicator({ syncStatus }: { syncStatus: SyncStatus }) {
  if (syncStatus.status !== "syncing") return null;

  const current = syncStatus.progress?.current ?? 0;
  const total = syncStatus.progress?.total ?? 0;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="px-5 py-2 border-b border-radius-border-subtle bg-radius-bg-secondary">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-radius-text-secondary">
          {syncStatus.phase === "initial" ? "📥 Fetching your inbox" : "🔄 Catching up"}
        </span>
        <span className="text-radius-text-muted tabular-nums">
          {current.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="h-1 bg-radius-bg-tertiary rounded-full overflow-hidden">
        <div
          className="h-full bg-radius-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
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
}: InboxListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  const handleMessageClick = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect]
  );

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-radius-border-subtle">
        <span className="text-sm font-semibold text-radius-text-primary">Inbox</span>
        <span className="text-xs text-radius-text-muted tabular-nums">
          {total.toLocaleString()} messages
        </span>
      </div>

      {/* Sync indicator */}
      <SyncIndicator syncStatus={syncStatus} />

      {/* Messages or empty state */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-10 h-10 rounded-full bg-radius-bg-tertiary flex items-center justify-center mb-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-radius-text-muted"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <p className="text-sm text-radius-text-secondary">
            {syncStatus.status === "syncing"
              ? "Your emails are on their way..."
              : "No messages yet"}
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
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const message = messages[virtualItem.index];
              return (
                <div
                  key={message.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
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
