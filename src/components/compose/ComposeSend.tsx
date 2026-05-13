import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, MailSend01Icon, ArchiveIcon } from "@hugeicons/core-free-icons";

export type SendActionType = "send" | "draft";

interface ComposeSendProps {
  canSubmit: boolean;
  pendingAction: SendActionType | null;
  onAction: (action: SendActionType) => void;
}

export function ComposeSend({ canSubmit, pendingAction, onAction }: ComposeSendProps) {
  const [open, setOpen] = useState(false);
  const [defaultAction, setDefaultAction] = useState<SendActionType>("send");
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

  const handleSelectDefault = (action: SendActionType) => {
    setDefaultAction(action);
    setOpen(false);
  };

  const isSending = pendingAction !== null;
  const disabled = !canSubmit || isSending;

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
          onClick={() => onAction(defaultAction)}
          className="inline-flex h-8 items-center gap-2 px-3 text-[12px] font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 transition-opacity"
        >
          {isSending && pendingAction === defaultAction ? (
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
            <motion.div layout>
              {defaultAction === "send" ? "Send" : "Save Draft"}
            </motion.div>
          )}
        </button>
        <div className="w-px bg-radius-bg-primary/20" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className={`inline-flex h-8 items-center px-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
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
            className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[160px] overflow-hidden rounded-xl border border-radius-border-subtle bg-radius-bg-primary p-1 shadow-xl"
          >
            <div className="flex flex-col">
              <SendOption 
                icon={<HugeiconsIcon icon={MailSend01Icon} size={14} />} 
                label="Send now" 
                selected={defaultAction === "send"} 
                onClick={() => handleSelectDefault("send")} 
              />
              <SendOption 
                icon={<HugeiconsIcon icon={ArchiveIcon} size={14} />} 
                label="Save as draft" 
                selected={defaultAction === "draft"} 
                onClick={() => handleSelectDefault("draft")} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SendOption({ icon, label, selected, onClick }: { icon: React.ReactNode; label: string; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ backgroundColor: "var(--radius-bg-secondary)" }}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-radius-text-secondary transition-colors hover:text-radius-text-primary"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-radius-text-muted">{icon}</span>
        <span className={selected ? "text-radius-text-primary" : ""}>{label}</span>
      </div>
      {selected && <div className="h-1.5 w-1.5 rounded-full bg-radius-text-primary" />}
    </motion.button>
  );
}
