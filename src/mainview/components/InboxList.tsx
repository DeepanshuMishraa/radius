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
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
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
        flex items-center gap-4 px-5 py-3 cursor-pointer select-none
        transition-colors duration-80
        ${isSelected
          ? "border-l-[3px] border-l-radius-accent bg-radius-bg-secondary pl-[17px]"
          : "border-l-[3px] border-l-transparent hover:bg-radius-bg-secondary pl-5"
        }
      `}
    >
      <span className={`text-[13px] w-[140px] shrink-0 truncate font-medium ${
        isSelected ? "text-radius-text-primary" : "text-radius-text-primary"
      }`}>
        {message.from.split("<")[0].trim() || message.from}
      </span>

      <span className="text-[13px] flex-1 truncate text-radius-text-secondary">
        {message.subject}
      </span>

      <span className="text-[12px] text-radius-text-muted shrink-0 font-mono tabular-nums">
        {formatDate(message.internalDate)}
      </span>
    </div>
  );
}

function SyncIndicator({ syncStatus }: { syncStatus: SyncStatus }) {
  if (syncStatus.status !== "syncing") return null;

  const current = syncStatus.progress?.current ?? 0;
  const total = syncStatus.progress?.total ?? 0;
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div className="px-5 py-2.5 border-b border-radius-border-subtle bg-radius-bg-secondary">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-radius-text-secondary uppercase tracking-[0.5px]">
          {syncStatus.phase === "initial" ? "Syncing inbox" : "Catching up"}
        </span>
        <span className="text-[11px] text-radius-text-muted font-mono tabular-nums">
          {current.toLocaleString()}/{total.toLocaleString()}
        </span>
      </div>
      <div className="h-[2px] bg-radius-bg-tertiary rounded-full overflow-hidden">
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
    estimateSize: () => 44,
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
        <span className="font-display text-[13px] font-semibold text-radius-text-primary tracking-[0.3px]">
          Inbox
        </span>
        <span className="text-[11px] text-radius-text-muted font-mono tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>

      {/* Sync indicator */}
      <SyncIndicator syncStatus={syncStatus} />

      {/* Messages */}
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
          <p className="text-[13px] text-radius-text-muted">
            {syncStatus.status === "syncing" ? "Fetching your emails" : "No messages"}
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
