import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import type { Message, SyncStatus, EmailCategory } from "../hooks/useInbox";

interface InboxListProps {
  messages: Message[];
  total: number;
  selectedId: string | null;
  selectedIds?: Set<string>;
  onSelect: (id: string, multi: boolean, range: boolean) => void;
  onToggleSelect?: (id: string) => void;
  syncStatus: SyncStatus;
  onReachEnd?: () => void;
  heading?: string;
  detail?: string;
  loading?: boolean;
  emptyMessage?: string;
  headerAction?: ReactNode;
  toolbar?: ReactNode;
  scrollTop?: number;
  onScrollChange?: (scrollTop: number) => void;
  highlightQuery?: string;
  onDragMessageToTrash?: (id: string) => void;
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
    promotional: "Promotions",
    social: "Social",
    updates: "Updates",
    forums: "Forums",
    spam: "Spam",
  };

  const label = labels[category];
  if (!label) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-[0.16em] text-radius-text-muted border border-radius-border-subtle/60 bg-radius-bg-secondary/40 backdrop-blur-sm"
      title={`${label} category`}
      aria-label={`${label} category`}
    >
      {label}
    </span>
  );
}

function ReadIndicator({ isRead }: { isRead: boolean }) {
  if (isRead)
    return (
      <span
        className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border border-radius-border-subtle/80 bg-transparent"
        aria-label="Read"
        title="Read"
      >
        <span className="sr-only">Read</span>
      </span>
    );

  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-radius-accent shadow-[0_0_8px_rgba(var(--radius-accent),0.4)]"
      title="Unread"
      aria-label="Unread"
    />
  );
}

function SenderAvatar({ senderName }: { senderName: string }) {
  const letter = (senderName || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-radius-border-subtle/70 bg-radius-bg-secondary text-[11px] font-semibold text-radius-text-primary">
      {letter}
    </span>
  );
}

function renderHighlightedText(text: string, query: string | undefined, className: string) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return <span className={className}>{text}</span>;
  }

  const normalizedText = text.toLowerCase();
  const normalizedQuery = trimmed.toLowerCase();
  const segments: Array<{ value: string; match: boolean }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index === -1) {
      segments.push({ value: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      segments.push({ value: text.slice(cursor, index), match: false });
    }
    segments.push({ value: text.slice(index, index + trimmed.length), match: true });
    cursor = index + trimmed.length;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-radius-accent-subtle px-[1px] text-inherit">
            {segment.value}
          </mark>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </span>
  );
}

function EmailRow({
  message,
  isSelected,
  isMultiSelected,
  onClick,
  onToggleSelect,
  highlightQuery,
  onDragToTrash,
}: {
  message: Message;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect?: (e: React.MouseEvent) => void;
  highlightQuery?: string;
  onDragToTrash?: (id: string) => void;
}) {
  const senderName = message.from?.split("<")[0].trim() || message.from || "";

  return (
    <div
      draggable={Boolean(onDragToTrash)}
      onDragStart={(event) => {
        if (!onDragToTrash) return;
        event.dataTransfer.setData("text/radius-message-id", message.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      aria-label={`${message.isRead ? "Read" : "Unread"} message from ${senderName}: ${message.subject}`}
      className={`
        group flex items-start gap-3 h-[80px] px-4 py-3 cursor-pointer select-none overflow-hidden transition-colors duration-150
        ${isSelected || isMultiSelected ? "border-l-[2px] border-l-radius-accent bg-radius-bg-secondary/80" : "border-l-[2px] border-l-transparent hover:bg-radius-bg-secondary/50"}
        ${!message.isRead && !isSelected && !isMultiSelected ? "bg-radius-accent-subtle/35" : ""}
      `}
    >
      {/* Unread dot / Checkbox column */}
      <div className="mt-[2px] shrink-0 flex flex-col items-center gap-2">
        {onToggleSelect && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(e);
            }}
            className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-opacity ${
              isMultiSelected
                ? "bg-radius-accent border-radius-accent opacity-100"
                : "border-radius-border-subtle bg-transparent opacity-0 group-hover:opacity-100"
            }`}
          >
            {isMultiSelected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        )}
        <ReadIndicator isRead={message.isRead} />
      </div>

      <div className="mt-[1px]">
        <SenderAvatar senderName={senderName} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Top line: sender + badges + date pill */}
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <div className="min-w-0 flex items-center gap-2">
            {renderHighlightedText(
              senderName,
              highlightQuery,
              `truncate text-[13.5px] font-[family-name:var(--font-family-sans)] ${
                message.isRead
                  ? "font-normal text-radius-text-primary/70"
                  : "font-bold text-radius-text-primary"
              }`,
            )}
            <CategoryBadge category={message.category} />
          </div>
          <span className={`shrink-0 text-[11px] font-[family-name:var(--font-family-sans)] ${
            message.isRead ? 'text-radius-text-muted/70' : 'text-radius-text-muted'
          }`}>
            {formatDateShort(message.internalDate)}
          </span>
        </div>

        {/* Subject */}
        {renderHighlightedText(
          message.subject,
          highlightQuery,
          `text-[13px] truncate font-[family-name:var(--font-family-sans)] leading-snug ${
            message.isRead
              ? "text-radius-text-primary/70 font-normal"
              : "text-radius-text-primary font-bold"
          }`,
        )}

        {/* Snippet */}
        {renderHighlightedText(
          message.snippet,
          highlightQuery,
          `text-[12.5px] truncate font-[family-name:var(--font-family-sans)] leading-relaxed mt-0.5 ${
            message.isRead
              ? "text-radius-text-muted/60"
              : "text-radius-text-secondary/80"
          }`,
        )}
      </div>
    </div>
  );
}

export function InboxList({
  messages,
  total,
  selectedId,
  selectedIds,
  onSelect,
  onToggleSelect,
  syncStatus,
  onReachEnd,
  heading = "Inbox",
  detail,
  loading = false,
  emptyMessage,
  headerAction,
  toolbar,
  scrollTop,
  onScrollChange,
  highlightQuery,
  onDragMessageToTrash,
}: InboxListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    getItemKey: (index) => messages[index]?.id ?? index,
    overscan: 5,
  });

  const handleMessageClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      onSelect(id, e.metaKey || e.ctrlKey, e.shiftKey);
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

  useEffect(() => {
    if (!parentRef.current || scrollTop === undefined) return;
    if (Math.abs(parentRef.current.scrollTop - scrollTop) < 4) return;
    parentRef.current.scrollTop = scrollTop;
  }, [scrollTop, messages.length]);

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
      {toolbar ? toolbar : null}

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
        <div
          ref={parentRef}
          className="flex-1 overflow-auto"
          onScroll={() => onScrollChange?.(parentRef.current?.scrollTop ?? 0)}
        >
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
                    isMultiSelected={selectedIds?.has(message.id)}
                    onClick={(e) => handleMessageClick(message.id, e)}
                    onToggleSelect={onToggleSelect ? () => onToggleSelect(message.id) : undefined}
                    highlightQuery={highlightQuery}
                    onDragToTrash={onDragMessageToTrash}
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
