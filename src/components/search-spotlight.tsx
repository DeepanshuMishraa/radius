import { useEffect, useRef } from "react";

type MessageSort = "newest" | "oldest" | "sender" | "subject";
type ReadFilter = "all" | "unread" | "read";
type AttachmentFilter = "all" | "attachments";
type CategoryFilter = "all" | "important" | "promotional" | "social" | "updates" | "forums" | "spam";

interface EmailSearchSpotlightProps {
  open: boolean;
  query: string;
  resultCount: number;
  loading: boolean;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  sortOrder: MessageSort;
  readFilter: ReadFilter;
  attachmentFilter: AttachmentFilter;
  categoryFilter: CategoryFilter;
  onChangeSortOrder: (value: MessageSort) => void;
  onChangeReadFilter: (value: ReadFilter) => void;
  onChangeAttachmentFilter: (value: AttachmentFilter) => void;
  onChangeCategoryFilter: (value: CategoryFilter) => void;
}

const categoryLabels: Record<CategoryFilter, string> = {
  all: "All categories",
  important: "Important",
  promotional: "Promotions",
  social: "Social",
  updates: "Updates",
  forums: "Forums",
  spam: "Spam",
};

export function EmailSearchSpotlight({
  open,
  query,
  resultCount,
  loading,
  onChangeQuery,
  onClose,
  onSubmit,
  sortOrder,
  readFilter,
  attachmentFilter,
  categoryFilter,
  onChangeSortOrder,
  onChangeReadFilter,
  onChangeAttachmentFilter,
  onChangeCategoryFilter,
}: EmailSearchSpotlightProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="border-b border-radius-border-subtle bg-radius-bg-primary/96 px-4 py-3">
      <label htmlFor="radius-email-search" className="sr-only">
        Search email
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-2xl border border-radius-border-subtle bg-radius-bg-secondary/35 px-3 py-2">
          <span className="shrink-0 select-none text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            /
          </span>
          <input
            id="radius-email-search"
            ref={inputRef}
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
                event.preventDefault();
                inputRef.current?.select();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Search sender, subject, snippet, or body text"
            aria-describedby="radius-email-search-hint"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-radius-text-primary outline-none placeholder:text-radius-text-muted font-[family-name:var(--font-family-sans)]"
          />
          <span className="shrink-0 text-[10px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {loading ? "Searching..." : `${resultCount.toLocaleString()} results`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-radius-text-muted transition-colors hover:text-radius-text-primary"
            aria-label="Close email search"
          >
            <span className="text-[15px] leading-none">×</span>
          </button>
        </div>

        <select
          value={sortOrder}
          onChange={(event) => onChangeSortOrder(event.target.value as MessageSort)}
          className="rounded-full border border-radius-border-subtle bg-radius-bg-primary px-3 py-2 text-[11px] text-radius-text-primary outline-none"
          aria-label="Sort messages"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="sender">Sender A-Z</option>
          <option value="subject">Subject A-Z</option>
        </select>
        <select
          value={readFilter}
          onChange={(event) => onChangeReadFilter(event.target.value as ReadFilter)}
          className="rounded-full border border-radius-border-subtle bg-radius-bg-primary px-3 py-2 text-[11px] text-radius-text-primary outline-none"
          aria-label="Filter by read state"
        >
          <option value="all">All messages</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </select>
        <select
          value={attachmentFilter}
          onChange={(event) => onChangeAttachmentFilter(event.target.value as AttachmentFilter)}
          className="rounded-full border border-radius-border-subtle bg-radius-bg-primary px-3 py-2 text-[11px] text-radius-text-primary outline-none"
          aria-label="Filter by attachment presence"
        >
          <option value="all">Any attachment state</option>
          <option value="attachments">Has attachments</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => onChangeCategoryFilter(event.target.value as CategoryFilter)}
          className="rounded-full border border-radius-border-subtle bg-radius-bg-primary px-3 py-2 text-[11px] text-radius-text-primary outline-none"
          aria-label="Filter by category"
        >
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div
        id="radius-email-search-hint"
        className="mt-2 text-[10px] text-radius-text-muted font-[family-name:var(--font-family-sans)]"
      >
        Try <span className="text-radius-text-primary">from:</span>, <span className="text-radius-text-primary">subject:</span>, or <span className="text-radius-text-primary">has:attachment</span>
      </div>
    </div>
  );
}
