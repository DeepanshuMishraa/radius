import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { EmailCategory, NotificationPreferences } from "@/shared/types";

const categoryOptions: Array<{ value: EmailCategory | "all"; label: string }> = [
  { value: "all", label: "Any category" },
  { value: "important", label: "Important" },
  { value: "promotional", label: "Promotions" },
  { value: "social", label: "Social" },
  { value: "updates", label: "Updates" },
  { value: "forums", label: "Forums" },
  { value: "spam", label: "Spam" },
  { value: "personal", label: "Personal" },
  { value: "regular", label: "Regular" },
];

interface NotificationPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
  currentSender?: string | null;
  currentThreadId?: string | null;
}

export function NotificationPreferencesDialog({
  open,
  onOpenChange,
  preferences,
  onChange,
  currentSender,
  currentThreadId,
}: NotificationPreferencesDialogProps) {
  const addMutedSender = () => {
    if (!currentSender) return;
    const normalized = currentSender.trim().toLowerCase();
    if (!normalized || preferences.mutedSenders.includes(normalized)) return;
    onChange({ ...preferences, mutedSenders: [...preferences.mutedSenders, normalized] });
  };

  const addMutedThread = () => {
    if (!currentThreadId || preferences.mutedThreads.includes(currentThreadId)) return;
    onChange({ ...preferences, mutedThreads: [...preferences.mutedThreads, currentThreadId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] border border-radius-border-subtle bg-radius-bg-primary p-0 shadow-2xl">
        <div className="border-b border-radius-border-subtle px-6 py-5">
          <DialogTitle className="text-[18px] font-medium text-radius-text-primary">
            Notification preferences
          </DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-radius-text-secondary">
            Keep alerts helpful by scoping what reaches you.
          </DialogDescription>
        </div>

        <div className="space-y-5 px-6 py-5">
          <label className="flex items-center justify-between rounded-2xl border border-radius-border-subtle px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-radius-text-primary">Enable alerts</p>
              <p className="mt-1 text-[12px] text-radius-text-secondary">Turn native and in-app new mail alerts on or off.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.enabled}
              onChange={(event) => onChange({ ...preferences, enabled: event.target.checked })}
            />
          </label>

          <div className="rounded-2xl border border-radius-border-subtle px-4 py-4">
            <p className="text-[13px] font-medium text-radius-text-primary">Alert scope</p>
            <div className="mt-3 grid gap-2">
              {[
                { value: "all", label: "All new mail" },
                { value: "important", label: "Important mail only" },
                { value: "category", label: "Only one category" },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-[12px] text-radius-text-secondary">
                  <input
                    type="radio"
                    name="notification-scope"
                    checked={preferences.scope === option.value}
                    onChange={() => onChange({ ...preferences, scope: option.value as NotificationPreferences["scope"] })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {preferences.scope === "category" ? (
              <select
                value={preferences.category}
                onChange={(event) =>
                  onChange({ ...preferences, category: event.target.value as NotificationPreferences["category"] })
                }
                className="mt-3 rounded-full border border-radius-border-subtle bg-radius-bg-primary px-3 py-2 text-[12px] text-radius-text-primary outline-none"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="rounded-2xl border border-radius-border-subtle px-4 py-4">
            <p className="text-[13px] font-medium text-radius-text-primary">Mute from what you are viewing</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addMutedSender}
                disabled={!currentSender}
                className="rounded-full border border-radius-border-subtle px-3 py-1.5 text-[11px] font-medium text-radius-text-primary disabled:opacity-40"
              >
                Mute this sender
              </button>
              <button
                type="button"
                onClick={addMutedThread}
                disabled={!currentThreadId}
                className="rounded-full border border-radius-border-subtle px-3 py-1.5 text-[11px] font-medium text-radius-text-primary disabled:opacity-40"
              >
                Mute this thread
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-radius-border-subtle px-4 py-4">
              <p className="text-[12px] font-medium text-radius-text-primary">Muted senders</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {preferences.mutedSenders.length === 0 ? (
                  <span className="text-[11px] text-radius-text-muted">None</span>
                ) : (
                  preferences.mutedSenders.map((sender) => (
                    <button
                      key={sender}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...preferences,
                          mutedSenders: preferences.mutedSenders.filter((value) => value !== sender),
                        })
                      }
                      className="rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-secondary"
                    >
                      {sender} ×
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-radius-border-subtle px-4 py-4">
              <p className="text-[12px] font-medium text-radius-text-primary">Muted threads</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {preferences.mutedThreads.length === 0 ? (
                  <span className="text-[11px] text-radius-text-muted">None</span>
                ) : (
                  preferences.mutedThreads.map((threadId) => (
                    <button
                      key={threadId}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...preferences,
                          mutedThreads: preferences.mutedThreads.filter((value) => value !== threadId),
                        })
                      }
                      className="rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-secondary"
                    >
                      {threadId.slice(0, 10)}… ×
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
