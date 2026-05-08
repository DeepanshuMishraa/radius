import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, EnvelopeSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { radiusRpc } from "@/mainview/lib/rpc";
import { type ContactOption, type Attachment } from "./types";
import { ComposeRecipients } from "./ComposeRecipients";
import { ComposeAttachments } from "./ComposeAttachments";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeSend, type SendActionType } from "./ComposeSend";

interface ComposeEmailDialogProps {
  open: boolean;
  onClose: () => void;
  fromAccount: { email: string; name: string } | null;
  contacts: ContactOption[];
}

export function ComposeEmailDialog({
  open,
  onClose,
  fromAccount,
  contacts,
}: ComposeEmailDialogProps) {
  const [selectedRecipients, setSelectedRecipients] = useState<ContactOption[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingAction, setPendingAction] = useState<SendActionType | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedRecipients([]);
    setSubject("");
    setBody("");
    setAttachments([]);
    setPendingAction(null);
    setDraftSavedAt(null);
  }, [open]);

  const handleAction = useCallback(
    async (action: SendActionType) => {
      if (!fromAccount?.email) {
        toast.error("Connect a Gmail account before composing");
        return;
      }

      // In a real app, attachments would be processed/uploaded here
      const payload = {
        from: fromAccount.email,
        to: selectedRecipients.map((item) => item.email),
        subject: subject.trim(),
        bodyText: body.trim(),
        // attachments: attachments 
      };

      setPendingAction(action);
      try {
        const result =
          action === "draft"
            ? await radiusRpc.request.saveDraft(payload)
            : await radiusRpc.request.sendEmail(payload);

        if (!result.success) {
          toast.error(result.error ?? "Something went wrong");
          return;
        }

        if (action === "draft") {
          setDraftSavedAt(Date.now());
          toast.success("Draft saved to Gmail");
          return;
        }

        toast.success("Email sent");
        onClose();
      } catch (error) {
        console.error(`Compose ${action} failed:`, error);
        toast.error(action === "draft" ? "Draft save failed" : "Send failed");
      } finally {
        setPendingAction(null);
      }
    },
    [body, fromAccount, onClose, selectedRecipients, subject] // Omitted attachments from deps to match original pattern
  );

  const handleAddAttachment = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const draftLabel =
    pendingAction === "draft"
      ? "SAVING"
      : draftSavedAt
        ? "SAVED"
        : "DRAFT";
  const canSubmit =
    Boolean(fromAccount?.email) &&
    selectedRecipients.length > 0 &&
    (subject.trim().length > 0 || body.trim().length > 0 || attachments.length > 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-transparent pointer-events-none"
        >
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className="w-full max-w-[720px] rounded-xl border border-radius-border-subtle bg-radius-bg-primary shadow-2xl flex flex-col font-[family-name:var(--font-family-sans)] antialiased pointer-events-auto overflow-hidden max-h-[90vh]"
          >
            {/* Header */}
            <motion.div layout className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <EnvelopeSimple size={16} weight="regular" className="text-radius-text-primary" />
                <h2 className="text-[13px] font-medium text-radius-text-primary">Compose email</h2>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onClose}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:text-radius-text-primary hover:bg-radius-bg-secondary"
                aria-label="Close compose"
              >
                <X size={14} weight="bold" />
              </motion.button>
            </motion.div>

            <div className="flex-1 overflow-y-auto">
              <ComposeRecipients
                fromAccount={fromAccount}
                contacts={contacts}
                selectedRecipients={selectedRecipients}
                setSelectedRecipients={setSelectedRecipients}
              />

              <motion.div layout className="px-5">
                <div className="my-2.5 h-[1px] w-full bg-radius-border-subtle" />

                {/* Subject */}
                <motion.div layout className="pb-1">
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject"
                    className="h-10 w-full bg-transparent text-[16px] font-semibold text-radius-text-primary outline-none placeholder:text-radius-text-muted"
                  />
                </motion.div>

                {/* Body */}
                <motion.div layout className="pt-1 pb-2">
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write your message..."
                    className="min-h-[140px] w-full resize-none border-0 bg-transparent px-0 py-1 text-[13px] leading-relaxed text-radius-text-secondary outline-none placeholder:text-radius-text-muted focus:ring-0 focus-visible:ring-0"
                  />
                </motion.div>
              </motion.div>
            </div>

            {/* Footer / Attachments */}
            <ComposeAttachmentList attachments={attachments} onRemove={handleRemoveAttachment} />

            {/* Bottom bar */}
            <motion.div layout className="flex items-center justify-between gap-3 px-5 py-3 border-t border-radius-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <ComposeAttachments onAddAttachment={handleAddAttachment} />
              </div>

              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#1d9bf0]" />
                  <span className="text-[10px] font-bold tracking-wider text-[#1d9bf0]">
                    {draftLabel}
                  </span>
                </div>

                <ComposeSend 
                  canSubmit={canSubmit} 
                  pendingAction={pendingAction} 
                  onAction={handleAction} 
                />
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { type ContactOption } from "./types";
