import { useState, useCallback, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { radiusRpc } from "@/mainview/lib/rpc";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Mail01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import type { Subscription, EmailCategory } from "../shared/types";
import { toast } from "sonner";

interface UnsubscribeManagerProps {
  open: boolean;
  onClose: () => void;
}

type UnsubscribeStatus = "idle" | "unsubscribing" | "success" | "failed";

export function UnsubscribeManager({ open, onClose }: UnsubscribeManagerProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, UnsubscribeStatus>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await radiusRpc.request.getSubscriptions({});
      setSubscriptions(result.subscriptions);
      if (result.subscriptions.length === 0) {
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadSubscriptions();
      setSelected(new Set());
      setStatuses({});
    }
  }, [open, loadSubscriptions]);

  const filteredSubscriptions = useMemo(() => {
    if (!searchQuery.trim()) return subscriptions;
    const q = searchQuery.toLowerCase();
    return subscriptions.filter(
      (s) =>
        s.senderEmail.toLowerCase().includes(q) ||
        s.senderName.toLowerCase().includes(q)
    );
  }, [subscriptions, searchQuery]);

  const toggleSelect = useCallback((email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === filteredSubscriptions.length) return new Set();
      return new Set(filteredSubscriptions.map((s) => s.senderEmail));
    });
  }, [filteredSubscriptions]);

  const unsubscribeSender = useCallback(async (senderEmail: string): Promise<{ success: boolean }> => {
    setStatuses((prev) => ({ ...prev, [senderEmail]: "unsubscribing" }));
    try {
      const result = await radiusRpc.request.unsubscribeFromSender({ senderEmail });
      if (result.success) {
        setStatuses((prev) => ({ ...prev, [senderEmail]: "success" }));
        setSubscriptions((prev) => prev.filter((s) => s.senderEmail !== senderEmail));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(senderEmail);
          return next;
        });
      } else {
        setStatuses((prev) => ({ ...prev, [senderEmail]: "failed" }));
        toast.error(`Failed to unsubscribe from ${senderEmail}: ${result.error ?? "Unknown error"}`);
      }
      return result;
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [senderEmail]: "failed" }));
      toast.error(`Failed to unsubscribe: ${String(err)}`);
      return { success: false };
    }
  }, []);

  const handleUnsubscribeSelected = useCallback(async () => {
    const emails = Array.from(selected);
    if (emails.length === 0) return;

    const results = await Promise.allSettled(
      emails.map((email) => unsubscribeSender(email))
    );

    let succeeded = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success === true) {
        succeeded++;
      } else {
        failed++;
      }
    }

    if (succeeded > 0) {
      toast.success(`Unsubscribed from ${succeeded} sender${succeeded > 1 ? "s" : ""}`);
    }
    if (failed > 0) {
      toast.error(`Failed to unsubscribe from ${failed} sender${failed > 1 ? "s" : ""}`);
    }
  }, [selected, unsubscribeSender]);

  const handleBlockSender = useCallback(async (senderEmail: string) => {
    try {
      const result = await radiusRpc.request.blockSender({ senderEmail });
      if (result.success) {
        setSubscriptions((prev) => prev.filter((s) => s.senderEmail !== senderEmail));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(senderEmail);
          return next;
        });
        toast.success(`Blocked sender: ${senderEmail}`);
      } else {
        toast.error(result.error ?? "Failed to block sender");
      }
    } catch (err) {
      toast.error(`Failed to block sender: ${String(err)}`);
    }
  }, []);

  const getCategoryBadgeClass = (category: EmailCategory) => {
    switch (category) {
      case "promotional":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "social":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "updates":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "forums":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "spam":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Unsubscribe Manager</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your email subscriptions and unsubscribe from senders.
        </DialogDescription>

        <div className="flex items-center justify-between border-b border-radius-border-subtle px-5 py-4">
          <h2 className="text-[15px] font-semibold text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            Unsubscribe Manager
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </button>
        </div>

        <div className="border-b border-radius-border-subtle px-5 py-3">
          <input
            type="text"
            placeholder="Search senders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-radius-border-subtle bg-radius-bg-secondary px-3 py-2 text-[13px] text-radius-text-primary placeholder:text-radius-text-muted outline-none focus:border-radius-accent transition-colors font-[family-name:var(--font-family-sans)]"
          />
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 border-b border-radius-border-subtle px-5 py-2.5">
            <button
              type="button"
              onClick={handleUnsubscribeSelected}
              disabled={Object.values(statuses).some((s) => s === "unsubscribing")}
              className="rounded-lg bg-radius-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-radius-accent/90 disabled:opacity-50 font-[family-name:var(--font-family-sans)]"
            >
              Unsubscribe ({selected.size})
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-radius-accent border-t-transparent" />
              <span className="ml-3 text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                Loading subscriptions...
              </span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 py-12">
              <HugeiconsIcon icon={AlertCircleIcon} size={24} className="text-red-500" />
              <p className="text-[13px] text-red-500 font-[family-name:var(--font-family-sans)]">{error}</p>
              <button
                type="button"
                onClick={loadSubscriptions}
                className="rounded-lg border border-radius-border-subtle px-3 py-1.5 text-[12px] font-semibold text-radius-text-primary transition-colors hover:bg-radius-bg-secondary font-[family-name:var(--font-family-sans)]"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredSubscriptions.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12">
              <HugeiconsIcon icon={Mail01Icon} size={24} className="text-radius-text-muted" />
              <p className="text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                {searchQuery.trim()
                  ? "No senders match your search."
                  : "No subscriptions found. We'll detect them as new emails arrive."}
              </p>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-1">
              {selected.size > 0 && selected.size === filteredSubscriptions.length && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-radius-text-muted transition-colors hover:bg-radius-bg-secondary font-[family-name:var(--font-family-sans)]"
                >
                  <div className="flex h-4 w-4 items-center justify-center rounded border border-radius-accent bg-radius-accent">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} size={10} className="text-white" />
                  </div>
                  Deselect all
                </button>
              )}
              {selected.size === 0 && filteredSubscriptions.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-radius-text-muted transition-colors hover:bg-radius-bg-secondary font-[family-name:var(--font-family-sans)]"
                >
                  <div className="flex h-4 w-4 items-center justify-center rounded border border-radius-border-subtle" />
                  Select all ({filteredSubscriptions.length})
                </button>
              )}
              {filteredSubscriptions.map((sub) => {
                const status = statuses[sub.senderEmail] ?? "idle";
                const displayName = sub.senderName || sub.senderEmail;

                return (
                  <div
                    key={sub.senderEmail}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                      status === "unsubscribing"
                        ? "opacity-50"
                        : "hover:bg-radius-bg-secondary"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(sub.senderEmail)}
                      disabled={status === "unsubscribing" || status === "success"}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-radius-border-subtle transition-colors hover:border-radius-accent disabled:opacity-30"
                    >
                      {selected.has(sub.senderEmail) && (
                        <div className="h-2 w-2 rounded-sm bg-radius-accent" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-serif)]">
                          {displayName}
                        </span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${getCategoryBadgeClass(sub.category)}`}>
                          {sub.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="truncate text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                          {sub.senderEmail}
                        </span>
                        <span className="shrink-0 text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                          · {sub.messageCount} email{sub.messageCount > 1 ? "s" : ""}
                        </span>
                        {sub.unsubscribeMethod === "none" && (
                          <span className="shrink-0 text-[11px] text-orange-500 font-[family-name:var(--font-family-sans)]">
                            · No unsubscribe method
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {status === "unsubscribing" && (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-radius-accent border-t-transparent" />
                      )}
                      {status === "success" && (
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="text-green-500" />
                      )}
                      {status === "failed" && (
                        <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-red-500" />
                      )}
                      {status === "idle" && sub.unsubscribeMethod !== "none" && (
                        <button
                          type="button"
                          onClick={() => unsubscribeSender(sub.senderEmail)}
                          className="rounded-md bg-radius-accent/10 px-2.5 py-1 text-[11px] font-semibold text-radius-accent transition-colors hover:bg-radius-accent/20 font-[family-name:var(--font-family-sans)]"
                        >
                          Unsubscribe
                        </button>
                      )}
                      {status === "idle" && sub.unsubscribeMethod === "none" && (
                        <button
                          type="button"
                          onClick={() => handleBlockSender(sub.senderEmail)}
                          className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 font-[family-name:var(--font-family-sans)]"
                        >
                          Block
                        </button>
                      )}
                      {status === "failed" && (
                        <button
                          type="button"
                          onClick={() => unsubscribeSender(sub.senderEmail)}
                          className="rounded-md bg-radius-accent/10 px-2.5 py-1 text-[11px] font-semibold text-radius-accent transition-colors hover:bg-radius-accent/20 font-[family-name:var(--font-family-sans)]"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
