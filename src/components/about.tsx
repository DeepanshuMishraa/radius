import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Mail01Icon } from "@hugeicons/core-free-icons";
import type { LocalReleaseInfo } from "@/shared/types";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  info: LocalReleaseInfo | null;
}

export function AboutDialog({ open, onClose, info }: AboutDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-radius-bg-primary/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-[360px] rounded-2xl border border-radius-border-subtle bg-radius-bg-primary p-8 shadow-[0_16px_48px_rgba(0,0,0,0.16)] animate-in zoom-in-95 duration-200 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 inline-flex h-6 w-6 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          aria-label="Close"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-radius-accent-subtle">
          <HugeiconsIcon icon={Mail01Icon} size={28} className="text-radius-accent" />
        </div>

        <h2 className="text-[18px] font-semibold text-radius-text-primary font-[family-name:var(--font-family-sans)] tracking-tight">
          Radius
        </h2>
        <p className="mt-1 text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          A Minimal and Clean Distraction Free Client
        </p>

        <div className="mt-5 inline-flex items-center rounded-full border border-radius-border-subtle bg-radius-bg-secondary px-3 py-1">
          <span className="text-[11px] font-medium text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
            Version {info?.version ?? "…"}
          </span>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
          <span className="inline-flex h-2 w-2 rounded-full bg-radius-accent" />
          <span>Built with care</span>
        </div>
      </div>
    </div>
  );
}
