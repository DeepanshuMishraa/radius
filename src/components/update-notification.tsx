import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CircleArrowUp02Icon } from "@hugeicons/core-free-icons";
import type { UpdateInfo } from "@/shared/types";

interface UpdateNotificationProps {
  updateInfo: UpdateInfo | null;
  isDownloading: boolean;
  isApplying: boolean;
  onDownload: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
  onDismiss: () => void;
}

export function UpdateNotification({
  updateInfo,
  isDownloading,
  isApplying,
  onDownload,
  onApply,
  onDismiss,
}: UpdateNotificationProps) {
  if (!updateInfo || (!updateInfo.updateAvailable && !updateInfo.updateReady)) {
    return null;
  }

  return (
    <div className="toast pointer-events-auto w-[300px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <HugeiconsIcon icon={CircleArrowUp02Icon} size={18} className="mt-0.5 shrink-0 text-radius-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-medium text-radius-text-primary leading-snug font-[family-name:var(--font-family-sans)]">
              {updateInfo.updateReady
                ? `Radius ${updateInfo.version} ready`
                : `Radius ${updateInfo.version} available`}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-[-2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
              aria-label="Dismiss"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} className="text-radius-text-muted" />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-[1.5] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
            {isDownloading
              ? "Downloading update…"
              : isApplying
                ? "Restarting to install update…"
                : updateInfo.updateReady
                  ? "Downloaded and ready to install. The app will restart automatically."
                  : "Download now to get the latest improvements and fixes."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-radius-border-subtle px-3.5 py-2.5">
        {updateInfo.updateReady ? (
          <button
            type="button"
            disabled={isApplying}
            onClick={() => void onApply()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isApplying && (
              <svg className="animate-spin text-current" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            <span>Install & Restart</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => void onDownload()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-radius-accent px-3 py-1.5 text-[11px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDownloading && (
              <svg className="animate-spin text-current" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            <span>Download</span>
          </button>
        )}
      </div>
    </div>
  );
}
