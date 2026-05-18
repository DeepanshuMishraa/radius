import type { SyncHistoryEntry, SyncMode } from "@/shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function formatEventTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const levelClasses: Record<SyncHistoryEntry["level"], string> = {
  info: "bg-radius-accent",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-radius-error",
};

interface SyncDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncMode?: SyncMode;
  syncError?: string;
  events: SyncHistoryEntry[];
  onRefresh: () => void;
  onResync: () => void;
  onReconnect: () => void;
}

export function SyncDetailsDialog({
  open,
  onOpenChange,
  syncMode,
  syncError,
  events,
  onRefresh,
  onResync,
  onReconnect,
}: SyncDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] border border-radius-border-subtle bg-radius-bg-primary p-0 shadow-2xl">
        <div className="border-b border-radius-border-subtle px-6 py-5">
          <DialogTitle className="text-[18px] font-medium text-radius-text-primary">
            Sync details
          </DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-radius-text-secondary">
            Check recent sync activity and recover faster when Gmail needs attention.
          </DialogDescription>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-radius-border-subtle bg-radius-bg-secondary/35 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-radius-text-muted">
              Recovery actions
            </p>
            <p className="mt-2 text-[12px] leading-6 text-radius-text-secondary">
              {syncError
                ? syncError
                : syncMode === "all"
                  ? "Radius is keeping a complete local archive for this account."
                  : "Radius is keeping recent mail nearby first, then filling in more when needed."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={onRefresh} className="rounded-full border border-radius-border-subtle px-3 py-1.5 text-[11px] font-medium text-radius-text-primary transition-colors hover:border-radius-border">
                Refresh now
              </button>
              <button type="button" onClick={onReconnect} className="rounded-full border border-radius-border-subtle px-3 py-1.5 text-[11px] font-medium text-radius-text-primary transition-colors hover:border-radius-border">
                Reconnect Gmail
              </button>
              <button type="button" onClick={onResync} className="rounded-full border border-radius-border-subtle px-3 py-1.5 text-[11px] font-medium text-radius-text-primary transition-colors hover:border-radius-border">
                Rebuild local inbox
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-radius-text-muted">
              Recent activity
            </p>
            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="rounded-2xl border border-radius-border-subtle px-4 py-3 text-[12px] text-radius-text-muted">
                  No sync events yet.
                </div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-radius-border-subtle px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${levelClasses[event.level]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[12px] font-medium text-radius-text-primary">
                            {event.title}
                          </p>
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-radius-text-muted">
                            {formatEventTime(event.createdAt)}
                          </span>
                        </div>
                        {event.detail ? (
                          <p className="mt-1 text-[12px] leading-5 text-radius-text-secondary">
                            {event.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
