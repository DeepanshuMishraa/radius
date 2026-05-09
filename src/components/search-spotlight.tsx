import { useRef, useEffect } from "react";

interface EmailSearchSpotlightProps {
  open: boolean;
  query: string;
  resultCount: number;
  loading: boolean;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function EmailSearchSpotlight({
  open,
  query,
  resultCount,
  loading,
  onChangeQuery,
  onClose,
  onSubmit,
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
    <div className="pointer-events-none fixed inset-x-0 top-11 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[420px] border border-radius-border-subtle bg-radius-bg-primary">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="shrink-0 select-none text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            /
          </span>
          <input
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
            placeholder="Search email"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-radius-text-primary outline-none placeholder:text-radius-text-muted font-[family-name:var(--font-family-sans)]"
          />
          {query.trim() ? (
            <span className="shrink-0 text-[10px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
              {loading ? "..." : `${resultCount.toLocaleString()}`}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-radius-text-muted transition-colors hover:text-radius-text-primary"
            aria-label="Close email search"
          >
            <span className="text-[15px] leading-none">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}
