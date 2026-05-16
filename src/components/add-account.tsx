import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { SyncMode } from "@/shared/types";

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (mode: SyncMode) => void;
  selectedMode: SyncMode | null;
  onSelectMode: (mode: SyncMode) => void;
}

export function AddAccountDialog({
  open,
  onClose,
  onConnect,
  selectedMode,
  onSelectMode,
}: AddAccountDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-radius-bg-primary/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div role="dialog" aria-modal="true" className="w-full max-w-[400px] rounded-2xl border border-radius-border-subtle bg-radius-bg-primary p-6 shadow-[0_16px_48px_rgba(0,0,0,0.16)] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            Add Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} className="text-radius-text-muted" />
          </button>
        </div>

        <p className="mb-5 text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          Connect another Gmail account to Radius.
        </p>

        <div className="mb-6 grid gap-2">
          <button
            type="button"
            onClick={() => onSelectMode("recent")}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-200 ${
              selectedMode === "recent"
                ? "border-radius-accent bg-radius-bg-secondary"
                : "border-radius-border-subtle hover:bg-radius-bg-secondary/60"
            }`}
          >
            <div className="text-left">
              <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
                Recent emails
              </p>
              <p className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                Fetch latest 3,000 emails
              </p>
            </div>
            <span
              className={`inline-flex h-4 w-4 shrink-0 rounded-full border ${
                selectedMode === "recent"
                  ? "border-radius-accent bg-radius-accent"
                  : "border-radius-border-subtle"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => onSelectMode("all")}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-200 ${
              selectedMode === "all"
                ? "border-radius-accent bg-radius-bg-secondary"
                : "border-radius-border-subtle hover:bg-radius-bg-secondary/60"
            }`}
          >
            <div className="text-left">
              <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
                All emails
              </p>
              <p className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                Full migration in background
              </p>
            </div>
            <span
              className={`inline-flex h-4 w-4 shrink-0 rounded-full border ${
                selectedMode === "all"
                  ? "border-radius-accent bg-radius-accent"
                  : "border-radius-border-subtle"
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (selectedMode) {
              onConnect(selectedMode);
            }
          }}
          disabled={!selectedMode}
          className="w-full rounded-xl bg-radius-accent px-4 py-2.5 text-[13px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:bg-radius-bg-secondary disabled:text-radius-text-muted disabled:cursor-not-allowed font-[family-name:var(--font-family-sans)]"
        >
          Connect Gmail
        </button>
      </div>
    </div>
  );
}
