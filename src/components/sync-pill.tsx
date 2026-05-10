import { useSyncStatus } from "@/mainview/hooks/useInbox";

interface SyncPillProps {
  syncStatus: ReturnType<typeof useSyncStatus>;
  notice: string | null;
}

export function SyncPill({ syncStatus, notice }: SyncPillProps) {
  const isInitialSync =
    syncStatus.status === "syncing" &&
    (syncStatus.phase === "initial" || !syncStatus.initialSyncCompletedAt);
  const shouldShow =
    Boolean(notice) || syncStatus.status === "error" || isInitialSync;

  if (!shouldShow) return null;

  const current = syncStatus.progress?.current ?? 0;
  const total = syncStatus.progress?.total ?? 0;
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;
  const isStillFetching = current >= total && syncStatus.status === "syncing";

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[18px] border border-radius-border-subtle bg-radius-bg-primary/92 shadow-[0_12px_36px_rgba(0,0,0,0.14)] backdrop-blur-xl">
      <div className="flex items-start gap-3 px-3.5 py-3">
        {syncStatus.status === "error" ? (
          <span className="mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-radius-error" />
        ) : notice ? (
          <span className="mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-radius-accent" />
        ) : (
          <svg
            className="mt-0.5 shrink-0 animate-spin text-radius-accent"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            {syncStatus.status === "error"
              ? "Sync needs attention"
              : notice
                ? "Gmail sync notice"
                : "Bringing your inbox in"}
          </p>
          <p className="mt-1 text-[11px] leading-[1.55] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
            {notice ??
              (syncStatus.status === "error"
                ? syncStatus.error ?? "Radius could not finish syncing."
                : total > 0
                  ? isStillFetching
                    ? `${current.toLocaleString()} messages fetched • discovering more...`
                    : `${pct}% synced • ${current.toLocaleString()} of ${total.toLocaleString()} messages`
                  : "Your first sync is running in the background. You can start reading while the rest lands.")}
          </p>
          {isInitialSync && total > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-radius-bg-tertiary">
              <div
                className="h-full rounded-full bg-radius-accent transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
