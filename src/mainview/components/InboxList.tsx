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
      `}
    >
      {/* Top line: sender + date pill */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-radius-text-primary truncate pr-3 font-[family-name:var(--font-family-sans)]">
          {senderName}
        </span>
        <span className="shrink-0 text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)] border border-radius-border-subtle rounded-full px-2 py-0.5">
          {formatDateShort(message.internalDate)}
        </span>
      </div>

      {/* Subject */}
      <p className="text-[13px] text-radius-text-primary truncate mb-0.5 font-[family-name:var(--font-family-sans)]">
        {message.subject}
      </p>

      {/* Snippet */}
      <p className="text-[12px] text-radius-text-muted truncate leading-[1.4] font-[family-name:var(--font-family-sans)]">
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

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary pt-9">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-radius-border-subtle">
        <span className="text-[11px] font-semibold text-radius-text-muted uppercase tracking-[1px] font-[family-name:var(--font-family-sans)]">
          Inbox
        </span>
        <span className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
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
