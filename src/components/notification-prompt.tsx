import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, BellDotIcon } from "@hugeicons/core-free-icons";

interface NotificationPermissionPromptProps {
  visible: boolean;
  mode: "default" | "followup";
  onRequestPermission: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  onDismiss: () => void;
}

export function NotificationPermissionPrompt({
  visible,
  mode,
  onRequestPermission,
  onOpenSettings,
  onDismiss,
}: NotificationPermissionPromptProps) {
  if (!visible) return null;

  return (
    <div className="toast pointer-events-auto w-[300px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <HugeiconsIcon icon={BellDotIcon} size={18} className="mt-0.5 shrink-0 text-radius-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-radius-text-primary leading-snug font-[family-name:var(--font-family-sans)]">
            {mode === "followup"
              ? "Set Radius to Banners"
              : "Turn on new mail alerts"}
          </p>
          <p className="mt-1 text-[11px] leading-[1.5] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {mode === "followup"
              ? "Open Notifications settings and set Radius to Banners so new mail pops up."
              : "Enable native alerts so Radius can notify you when new email arrives."}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-[-2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          aria-label="Dismiss"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} className="text-radius-text-muted" />
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-radius-border-subtle px-3.5 py-2.5">
        {mode === "followup" ? (
          <button
            type="button"
            onClick={() => void onOpenSettings()}
            className="inline-flex items-center rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover cursor-pointer"
          >
            Open Settings
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onRequestPermission()}
            className="inline-flex items-center rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover cursor-pointer"
          >
            Enable alerts
          </button>
        )}
      </div>
    </div>
  );
}
