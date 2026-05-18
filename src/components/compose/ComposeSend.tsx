import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Mail01Icon,
  MailSend01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";

export type SendAction =
  | { kind: "send" }
  | { kind: "draft" }
  | { kind: "schedule"; sendAt: number; label: string };

interface ComposeSendProps {
  canSubmit: boolean;
  pendingAction: SendAction["kind"] | null;
  onAction: (action: SendAction) => void;
}

function nextTomorrowMorning() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(8, 0, 0, 0);
  return value.getTime();
}

function nextMondayMorning() {
  const value = new Date();
  const day = value.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  value.setDate(value.getDate() + daysUntilMonday);
  value.setHours(9, 0, 0, 0);
  return value.getTime();
}

export function ComposeSend({ canSubmit, pendingAction, onAction }: ComposeSendProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const isSending = pendingAction !== null;
  const disabled = !canSubmit || isSending;
  const scheduleOptions: Array<Extract<SendAction, { kind: "schedule" }>> = [
    { kind: "schedule", sendAt: Date.now() + 60 * 60 * 1000, label: "In 1 hour" },
    { kind: "schedule", sendAt: nextTomorrowMorning(), label: "Tomorrow, 8:00 AM" },
    { kind: "schedule", sendAt: nextMondayMorning(), label: "Monday, 9:00 AM" },
  ];

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <motion.div
        layout
        whileHover={!disabled && !open ? { scale: 1.02 } : {}}
        whileTap={!disabled && !open ? { scale: 0.98 } : {}}
        className="inline-flex overflow-hidden rounded-md bg-radius-text-primary text-radius-bg-primary shadow-sm"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction({ kind: "send" })}
          className="inline-flex h-8 items-center gap-2 px-3 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending && pendingAction === "send" ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="flex items-center justify-center"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-radius-bg-primary/80">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            </motion.div>
          ) : (
            <>
              <HugeiconsIcon icon={MailSend01Icon} size={13} />
              <span>Send</span>
            </>
          )}
        </button>
        <div className="w-px bg-radius-bg-primary/20" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className={`inline-flex h-8 items-center px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            open ? "bg-radius-bg-primary/20" : "hover:bg-radius-bg-primary/10"
          }`}
          aria-label="More send options"
          aria-expanded={open}
        >
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
          </motion.div>
        </button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[210px] overflow-hidden rounded-xl border border-radius-border-subtle bg-radius-bg-primary p-1 shadow-xl"
          >
            <div className="flex flex-col">
              <SendOption
                icon={<HugeiconsIcon icon={MailSend01Icon} size={14} />}
                label="Send now"
                onClick={() => {
                  setOpen(false);
                  onAction({ kind: "send" });
                }}
              />
              {scheduleOptions.map((option) => (
                <SendOption
                  key={option.label}
                  icon={<HugeiconsIcon icon={Mail01Icon} size={14} />}
                  label={`Schedule: ${option.label}`}
                  onClick={() => {
                    setOpen(false);
                    onAction(option);
                  }}
                />
              ))}
              <SendOption
                icon={<HugeiconsIcon icon={PencilEdit01Icon} size={14} />}
                label="Save as draft"
                onClick={() => {
                  setOpen(false);
                  onAction({ kind: "draft" });
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SendOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ backgroundColor: "var(--radius-bg-secondary)" }}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-radius-text-secondary transition-colors hover:text-radius-text-primary"
    >
      <span className="text-radius-text-muted">{icon}</span>
      <span>{label}</span>
    </motion.button>
  );
}
