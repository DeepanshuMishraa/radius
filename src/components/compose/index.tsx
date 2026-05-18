import { useState, useCallback, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Mail01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { radiusRpc } from "@/mainview/lib/rpc";
import { type ContactOption, type Attachment } from "./types";
import { ComposeRecipients } from "./ComposeRecipients";
import { ComposeAttachments } from "./ComposeAttachments";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeSend, type SendActionType } from "./ComposeSend";

export type ComposeIntent =
  | { kind: "compose" }
  | { kind: "reply" | "forward"; messageId: string };

interface ComposeEmailDialogProps {
  open: boolean;
  onClose: () => void;
  fromAccount: { email: string; name: string } | null;
  contacts: ContactOption[];
  intent: ComposeIntent;
}

function emptyState() {
  return {
    selectedRecipients: [] as ContactOption[],
    ccRecipients: [] as ContactOption[],
    bccRecipients: [] as ContactOption[],
    subject: "",
    body: "",
    attachments: [] as Attachment[],
  };
}

export function ComposeEmailDialog({
  open,
  onClose,
  fromAccount,
  contacts,
  intent,
}: ComposeEmailDialogProps) {
  const [{ selectedRecipients, ccRecipients, bccRecipients, subject, body, attachments }, setComposeState] = useState(emptyState);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SendActionType | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [sessionMode, setSessionMode] = useState<"compose" | "reply" | "forward">("compose");
  const [fixedRecipients, setFixedRecipients] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const subjectId = useId();
  const bodyId = useId();
  const reduceMotion = useReducedMotion();
  const requestedTitle =
    intent.kind === "reply"
      ? "Reply"
      : intent.kind === "forward"
        ? "Forward"
        : "Compose email";

  const setSelectedRecipients = useCallback(
    (value: React.SetStateAction<ContactOption[]>) => {
      setComposeState((current) => ({
        ...current,
        selectedRecipients:
          typeof value === "function" ? value(current.selectedRecipients) : value,
      }));
    },
    [],
  );

  const setCcRecipients = useCallback(
    (value: React.SetStateAction<ContactOption[]>) => {
      setComposeState((current) => ({
        ...current,
        ccRecipients: typeof value === "function" ? value(current.ccRecipients) : value,
      }));
    },
    [],
  );

  const setBccRecipients = useCallback(
    (value: React.SetStateAction<ContactOption[]>) => {
      setComposeState((current) => ({
        ...current,
        bccRecipients: typeof value === "function" ? value(current.bccRecipients) : value,
      }));
    },
    [],
  );

  const serializeAttachments = useCallback(
    () =>
      attachments.map((attachment) => ({
        id: attachment.id,
        type: attachment.type,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: attachment.type === "link" ? attachment.url : undefined,
      })),
    [attachments],
  );

  const persistComposer = useCallback(async () => {
    if (!sessionId || !fromAccount?.email) return;

    await radiusRpc.request.updateComposeSession({
      sessionId,
      from: fromAccount.email,
      to: selectedRecipients.map((item) => item.email),
      cc: ccRecipients.map((item) => item.email),
      bcc: bccRecipients.map((item) => item.email),
      subject: subject.trim(),
      bodyText: body,
      attachments: serializeAttachments(),
    });
  }, [bccRecipients, body, ccRecipients, fromAccount?.email, selectedRecipients, serializeAttachments, sessionId, subject]);

  useEffect(() => {
    if (!open) {
      setSessionId(null);
      setPendingAction(null);
      setDraftSavedAt(null);
      setHydrating(false);
      setSessionMode("compose");
      setFixedRecipients(false);
      setShowCc(false);
      setShowBcc(false);
      setComposeState((current) => {
        for (const att of current.attachments) {
          if (att.url) URL.revokeObjectURL(att.url);
        }
        return emptyState();
      });
      return;
    }
    if (!fromAccount?.email) return;

    setHydrating(true);
    setSessionId(null);
    setPendingAction(null);
    setDraftSavedAt(null);
    setSessionMode(intent.kind === "compose" ? "compose" : intent.kind);
    setFixedRecipients(intent.kind !== "compose");
    setComposeState((current) => {
      for (const att of current.attachments) {
        if (att.url) URL.revokeObjectURL(att.url);
      }
      return emptyState();
    });
    let cancelled = false;
    const request =
      intent.kind === "compose"
        ? radiusRpc.request.createComposeSession({ from: fromAccount.email })
        : radiusRpc.request.createReplyForwardSession({
            from: fromAccount.email,
            messageId: intent.messageId,
            mode: intent.kind,
          });
    void request
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.session) {
          toast.error(result.error ?? "Failed to load composer");
          onClose();
          return;
        }

        setSessionId(result.session.id);
        setDraftSavedAt(result.session.lastSavedAt ?? null);
        setSessionMode(result.session.mode);
        setFixedRecipients(result.session.fixedRecipients);
        setShowCc(result.session.cc.length > 0);
        setShowBcc(result.session.bcc.length > 0);
        setComposeState({
          selectedRecipients: result.session.to.map((email) => ({
            email,
            name: email,
            label: email,
            source: "manual",
          })),
          ccRecipients: result.session.cc.map((email) => ({
            email,
            name: email,
            label: email,
            source: "manual",
          })),
          bccRecipients: result.session.bcc.map((email) => ({
            email,
            name: email,
            label: email,
            source: "manual",
          })),
          subject: result.session.subject,
          body: result.session.bodyText,
          attachments: result.session.attachments.map((attachment) => ({
            id: attachment.id,
            type: attachment.type,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            dataBase64: attachment.dataBase64,
            url: attachment.url,
          })),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to create compose session:", error);
        toast.error("Failed to load composer");
        onClose();
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fromAccount?.email, intent, open]);

  useEffect(() => {
    if (!open || hydrating || !sessionId || !fromAccount?.email) return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      void persistComposer();
    }, 350);

    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [
    attachments,
    bccRecipients,
    body,
    ccRecipients,
    fromAccount?.email,
    hydrating,
    open,
    persistComposer,
    selectedRecipients,
    sessionId,
    subject,
  ]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleClose = useCallback(() => {
    if (!sessionId) {
      onClose();
      return;
    }

    const hasContent =
      selectedRecipients.length > 0 ||
      ccRecipients.length > 0 ||
      bccRecipients.length > 0 ||
      subject.trim().length > 0 ||
      body.trim().length > 0 ||
      attachments.length > 0;

    if (hasContent) {
      void persistComposer();
    } else {
      void radiusRpc.request.discardComposeSession({ sessionId });
    }
    onClose();
  }, [attachments.length, bccRecipients.length, body, ccRecipients.length, onClose, persistComposer, selectedRecipients.length, sessionId, subject]);

  const showUndoToast = useCallback((sendId: string, undoDeadlineAt: number) => {
    const duration = Math.max(0, undoDeadlineAt - Date.now());
    toast.custom(
      (t) => (
        <div className="toast pointer-events-auto w-[320px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[12px] font-semibold text-radius-text-primary">
                Sending in 10 seconds
              </div>
              <div className="text-[11px] text-radius-text-muted">
                Undo if you want to keep editing.
              </div>
            </div>
            <button
              type="button"
              className="rounded-md bg-radius-text-primary px-2.5 py-1 text-[11px] font-medium text-radius-bg-primary"
              onClick={async () => {
                const result = await radiusRpc.request.undoSend({ sendId });
                if (!result.success) {
                  toast.error(result.error ?? "Undo failed");
                  return;
                }
                toast.dismiss(t);
                toast.success("Message retrieved", {
                  description: "Your email has been moved back to drafts.",
                });
              }}
            >
              Undo
            </button>
          </div>
          <div
            className="toast-progress h-[2px] bg-radius-accent"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      ),
      { duration: Math.max(duration, 1000) },
    );
  }, []);

  const handleAction = useCallback(
    async (action: SendActionType) => {
      if (!fromAccount?.email) {
        toast.error("Connect a Gmail account before composing");
        return;
      }
      if (!sessionId) {
        toast.error("Composer is still loading");
        return;
      }

      setPendingAction(action);
      try {
        await persistComposer();
        if (action === "draft") {
          const result = await radiusRpc.request.saveDraft({ sessionId });
          if (!result.success) {
            toast.error(result.error ?? "Something went wrong");
            return;
          }
          setDraftSavedAt(result.lastSavedAt ?? Date.now());
          toast.success("Draft saved to Gmail");
          onClose();
          return;
        }

        const result = await radiusRpc.request.queueSend({ sessionId });
        if (!result.success || !result.sendId || !result.undoDeadlineAt) {
          toast.error(result.error ?? "Send failed");
          return;
        }
        showUndoToast(result.sendId, result.undoDeadlineAt);
        onClose();
      } catch (error) {
        console.error(`Compose ${action} failed:`, error);
        toast.error(action === "draft" ? "Draft save failed" : "Send failed");
      } finally {
        setPendingAction(null);
      }
    },
    [fromAccount?.email, onClose, persistComposer, sessionId, showUndoToast],
  );

  const handleAddAttachment = useCallback((attachment: Attachment) => {
    setComposeState((current) => ({
      ...current,
      attachments: [...current.attachments, attachment],
    }));
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setComposeState((current) => {
      const removed = current.attachments.find((attachment) => attachment.id === id);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return {
        ...current,
        attachments: current.attachments.filter((attachment) => attachment.id !== id),
      };
    });
  }, []);

  const draftLabel =
    pendingAction === "draft"
      ? "Saving..."
      : draftSavedAt
        ? "Saved"
        : sessionId
          ? "Unsaved"
          : "Draft";
  const canSubmit =
    Boolean(fromAccount?.email) &&
    (selectedRecipients.length > 0 || ccRecipients.length > 0 || bccRecipients.length > 0) &&
    (subject.trim().length > 0 || body.trim().length > 0 || attachments.length > 0);
  const title =
    sessionMode === "reply"
      ? "Reply"
      : sessionMode === "forward"
        ? "Forward"
        : requestedTitle;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-transparent pointer-events-none"
        >
          <motion.div
            ref={dialogRef}
            layout
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${subjectId}-title`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 35 }}
            className="w-full max-w-[720px] rounded-xl border border-radius-border-subtle bg-radius-bg-primary shadow-2xl flex flex-col font-[family-name:var(--font-family-sans)] antialiased pointer-events-auto overflow-hidden max-h-[90vh]"
          >
            <motion.div layout className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Mail01Icon} size={16} className="text-radius-text-primary" />
                <h2 id={`${subjectId}-title`} className="text-[13px] font-medium text-radius-text-primary">{title}</h2>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={handleClose}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:text-radius-text-primary hover:bg-radius-bg-secondary"
                aria-label="Close compose"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} className="text-radius-text-muted" />
              </motion.button>
            </motion.div>

            <div className="flex-1 overflow-y-auto">
              <ComposeRecipients
                fromAccount={fromAccount}
                contacts={contacts}
                selectedRecipients={selectedRecipients}
                setSelectedRecipients={setSelectedRecipients}
                locked={fixedRecipients}
              />
              {!fixedRecipients ? (
                <div className="px-5 pb-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShowCc((current) => !current)}
                    className="mr-3 text-radius-text-muted transition-colors hover:text-radius-text-primary"
                  >
                    {showCc ? "Hide Cc" : "Add Cc"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBcc((current) => !current)}
                    className="text-radius-text-muted transition-colors hover:text-radius-text-primary"
                  >
                    {showBcc ? "Hide Bcc" : "Add Bcc"}
                  </button>
                </div>
              ) : null}
              {showCc ? (
                <ComposeRecipients
                  fromAccount={fromAccount}
                  contacts={contacts}
                  selectedRecipients={ccRecipients}
                  setSelectedRecipients={setCcRecipients}
                  locked={false}
                  label="Cc"
                  placeholder="Add copy recipients"
                  autoFocus={false}
                  showFrom={false}
                />
              ) : null}
              {showBcc ? (
                <ComposeRecipients
                  fromAccount={fromAccount}
                  contacts={contacts}
                  selectedRecipients={bccRecipients}
                  setSelectedRecipients={setBccRecipients}
                  locked={false}
                  label="Bcc"
                  placeholder="Add hidden recipients"
                  autoFocus={false}
                  showFrom={false}
                />
              ) : null}

              <motion.div layout className="px-5">
                <div className="my-2.5 h-[1px] w-full bg-radius-border-subtle" />

                <motion.div layout className="pb-1">
                  <label htmlFor={subjectId} className="sr-only">
                    Subject
                  </label>
                  <input
                    id={subjectId}
                    value={subject}
                    onChange={(event) =>
                      setComposeState((current) => ({ ...current, subject: event.target.value }))
                    }
                    placeholder="Subject"
                    className="h-10 w-full bg-transparent text-[16px] font-semibold text-radius-text-primary outline-none placeholder:text-radius-text-muted"
                  />
                </motion.div>

                <motion.div layout className="pt-1 pb-2">
                  <label htmlFor={bodyId} className="sr-only">
                    Message body
                  </label>
                  <textarea
                    id={bodyId}
                    value={body}
                    onChange={(event) =>
                      setComposeState((current) => ({ ...current, body: event.target.value }))
                    }
                    placeholder="Write your message..."
                    className="min-h-[140px] w-full resize-none border-0 bg-transparent px-0 py-1 text-[13px] leading-relaxed text-radius-text-secondary outline-none placeholder:text-radius-text-muted focus:ring-0 focus-visible:ring-0"
                  />
                </motion.div>
              </motion.div>
            </div>

            <ComposeAttachmentList attachments={attachments} onRemove={handleRemoveAttachment} />

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
                <span className="text-[10px] text-radius-text-muted">
                  Closing keeps this draft.
                </span>

                <ComposeSend
                  canSubmit={canSubmit && !hydrating}
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
