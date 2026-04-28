import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback } from "react";
import type { Message } from "../hooks/useInbox";

interface InboxListProps {
  messages: Message[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
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
        className={`
        text-[13px] min-w-[140px] max-w-[180px] truncate
        ${isSelected ? "font-semibold text-radius-text-primary" : "font-medium text-radius-text-primary"}
      `}
      >
        {message.from.split("<")[0].trim() || message.from}
      </span>

      <span
        className={`
        text-[13px] flex-1 truncate text-radius-text-secondary
        ${isSelected ? "font-medium" : ""}
      `}
      >
        {message.subject}
      </span>

      <span className="text-xs text-radius-text-muted whitespace-nowrap">
        {formatDate(message.internalDate)}
      </span>
    </div>
  );
}

export function InboxList({
  messages,
  selectedId,
  onSelect,
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
        <span className="text-sm font-semibold text-radius-text-primary">
          Inbox
        </span>
        <span className="text-xs text-radius-text-muted">
          {messages.length} messages
        </span>
      </div>

      {/* Virtualized list */}
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
    </div>
  );
}
