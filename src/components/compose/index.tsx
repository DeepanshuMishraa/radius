import { useState, useCallback, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Mail01Icon,
  SentIcon,
  TextBoldIcon,
  TextItalicIcon,
  SignatureIcon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { radiusRpc } from "@/mainview/lib/rpc";
import { type ContactOption, type Attachment } from "./types";
import { ComposeRecipients } from "./ComposeRecipients";
import { ComposeAttachments } from "./ComposeAttachments";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeSend, type SendAction } from "./ComposeSend";

export type ComposeIntent =
  | { kind: "compose" }
  | { kind: "reply" | "forward"; messageId: string }
  | { kind: "session"; sessionId: string };

interface ComposeEmailDialogProps {
  open: boolean;
  onClose: () => void;
  fromAccount: { email: string; name: string } | null;
  accounts: Array<{ email: string; name: string }>;
  contacts: ContactOption[];
  intent: ComposeIntent;
}

const SIGNATURE_STORAGE_KEY = "radius.compose.signatures";

function readSignatureMap() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const raw = window.localStorage.getItem(SIGNATURE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSignatureMap(signatures: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(signatures));
}

function formatSignature(signature: string) {
  const trimmed = signature.trim();
  return trimmed ? `\n\n-- \n${trimmed}` : "";
}

function injectSignature(body: string, signature: string) {
  const block = formatSignature(signature);
  if (!block) return body;
  if (body.includes(block)) return body;
  return body ? `${body}${block}` : block.trimStart();
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
  accounts,
  contacts,
  intent,
}: ComposeEmailDialogProps) {
  const [{ selectedRecipients, ccRecipients, bccRecipients, subject, body, attachments }, setComposeState] = useState(emptyState);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SendAction["kind"] | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [sessionMode, setSessionMode] = useState<"compose" | "reply" | "forward">("compose");
  const [fixedRecipients, setFixedRecipients] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [selectedFromEmail, setSelectedFromEmail] = useState<string | null>(fromAccount?.email ?? null);
  const [signatureMap, setSignatureMap] = useState<Record<string, string>>(() => readSignatureMap());
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const subjectId = useId();
  const bodyId = useId();
  const reduceMotion = useReducedMotion();
  const requestedTitle =
    intent.kind === "reply"
      ? "Reply"
      : intent.kind === "forward"
        ? "Forward"
        : "Compose email";
  const selectedFromAccount =
    accounts.find((account) => account.email === selectedFromEmail) ?? fromAccount;
  const activeSignature =
    (selectedFromAccount?.email ? signatureMap[selectedFromAccount.email] : "") ?? "";

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
    if (!sessionId || !selectedFromAccount?.email) return;

    await radiusRpc.request.updateComposeSession({
      sessionId,
      from: selectedFromAccount.email,
      to: selectedRecipients.map((item) => item.email),
      cc: ccRecipients.map((item) => item.email),
      bcc: bccRecipients.map((item) => item.email),
      subject: subject.trim(),
      bodyText: body,
      attachments: serializeAttachments(),
    });
  }, [bccRecipients, body, ccRecipients, selectedFromAccount?.email, selectedRecipients, serializeAttachments, sessionId, subject]);

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
      setSignatureOpen(false);
      setSelectedFromEmail(fromAccount?.email ?? null);
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
    setSessionMode(intent.kind === "reply" || intent.kind === "forward" ? intent.kind : "compose");
    setFixedRecipients(intent.kind === "reply" || intent.kind === "forward");
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
        : intent.kind === "session"
          ? radiusRpc.request.getComposeSession({ sessionId: intent.sessionId })
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
        setSelectedFromEmail(result.session.from);
        setShowCc(result.session.cc.length > 0);
        setShowBcc(result.session.bcc.length > 0);
        const signature = signatureMap[result.session.from] ?? "";
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
          body:
            !result.session.bodyText.trim() && signature
              ? injectSignature(result.session.bodyText, signature)
              : result.session.bodyText,
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
  }, [fromAccount?.email, intent, open, signatureMap]);

  useEffect(() => {
    if (!open || hydrating || !sessionId || !selectedFromAccount?.email) return;
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
    selectedFromAccount?.email,
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

  const showUndoToast = useCallback((sendId: string, executeAt: number, scheduledLabel?: string) => {
    const duration = Math.max(0, executeAt - Date.now());
    toast.custom(
      (t) => (
        <div className="toast pointer-events-auto w-[320px] rounded-[14px] border border-radius-border-subtle bg-radius-bg-primary/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[12px] font-semibold text-radius-text-primary">
                {scheduledLabel ? `Scheduled for ${scheduledLabel}` : "Sending in 10 seconds"}
              </div>
              <div className="text-[11px] text-radius-text-muted">
                {scheduledLabel ? "Cancel if you want to keep editing." : "Undo if you want to keep editing."}
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
                toast.success(scheduledLabel ? "Schedule cancelled" : "Message retrieved", {
                  description: scheduledLabel
                    ? "Your draft is open again so you can keep editing."
                    : "Your email has been moved back to drafts.",
                });
              }}
            >
              {scheduledLabel ? "Cancel" : "Undo"}
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
    async (action: SendAction) => {
      if (!selectedFromAccount?.email) {
        toast.error("Connect a Gmail account before composing");
        return;
      }
      if (!sessionId) {
        toast.error("Composer is still loading");
        return;
      }

      setPendingAction(action.kind);
      try {
        await persistComposer();
        if (action.kind === "draft") {
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

        const result = await radiusRpc.request.queueSend({
          sessionId,
          sendAt: action.kind === "schedule" ? action.sendAt : undefined,
        });
        if (!result.success || !result.sendId || !result.undoDeadlineAt) {
          toast.error(result.error ?? "Send failed");
          return;
        }
        showUndoToast(
          result.sendId,
          result.undoDeadlineAt,
          action.kind === "schedule" ? action.label : undefined,
        );
        onClose();
      } catch (error) {
        console.error(`Compose ${action.kind} failed:`, error);
        toast.error(action.kind === "draft" ? "Draft save failed" : "Send failed");
      } finally {
        setPendingAction(null);
      }
    },
    [selectedFromAccount?.email, onClose, persistComposer, sessionId, showUndoToast],
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

  const handleFormatting = useCallback(
    (mode: "bold" | "italic" | "bullets" | "numbers") => {
      const textarea = bodyTextareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = body.slice(start, end);
      let nextBody = body;
      let nextStart = start;
      let nextEnd = end;

      if (mode === "bold" || mode === "italic") {
        const marker = mode === "bold" ? "**" : "*";
        const replacement = `${marker}${selected || "text"}${marker}`;
        nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;
        nextStart = start + marker.length;
        nextEnd = nextStart + (selected || "text").length;
      } else {
        const lines = (selected || "List item").split("\n");
        const replacement = lines
          .map((line, index) =>
            mode === "bullets" ? `- ${line}` : `${index + 1}. ${line}`
          )
          .join("\n");
        nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;
        nextStart = start;
        nextEnd = start + replacement.length;
      }

      setComposeState((current) => ({ ...current, body: nextBody }));
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextStart, nextEnd);
      });
    },
    [body]
  );

  const handleSignatureChange = useCallback((value: string) => {
    if (!selectedFromAccount?.email) return;
    setSignatureMap((current) => {
      const next = { ...current, [selectedFromAccount.email]: value };
      writeSignatureMap(next);
      return next;
    });
  }, [selectedFromAccount?.email]);

  const handleDropFiles = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;

    try {
      const nextAttachments = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buffer);
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const isImage = file.type.startsWith("image/");
          return {
            id: crypto.randomUUID(),
            type: isImage ? "image" : "file",
            name: file.name,
            size: file.size,
            mimeType: file.type || (isImage ? "image/png" : "application/octet-stream"),
            dataBase64: btoa(binary),
            file,
            url: isImage ? URL.createObjectURL(file) : undefined,
          } satisfies Attachment;
        })
      );
      nextAttachments.forEach((attachment) => handleAddAttachment(attachment));
    } catch (error) {
      console.error("Failed to drop attachment:", error);
      toast.error("Attachment upload failed");
    }
  }, [handleAddAttachment]);

  const draftLabel =
    pendingAction === "draft"
      ? "Saving..."
      : draftSavedAt
        ? "Saved"
        : sessionId
          ? "Unsaved"
          : "Draft";
  const canSubmit =
    Boolean(selectedFromAccount?.email) &&
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
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) {
                setIsDraggingOver(false);
              }
            }}
            onDrop={handleDropFiles}
          >
            {isDraggingOver ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-radius-bg-primary/92 backdrop-blur-sm">
                <div className="rounded-2xl border border-dashed border-radius-accent/40 px-5 py-4 text-center">
                  <p className="text-[13px] font-medium text-radius-text-primary">
                    Drop files to attach
                  </p>
                  <p className="mt-1 text-[11px] text-radius-text-muted">
                    Images and documents will be added to this draft.
                  </p>
                </div>
              </div>
            ) : null}
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
                fromAccount={selectedFromAccount}
                contacts={contacts}
                selectedRecipients={selectedRecipients}
                setSelectedRecipients={setSelectedRecipients}
                locked={fixedRecipients}
                onSuggestionError={(message) => {
                  toast.error("Contact suggestions unavailable", {
                    description: message,
                  });
                }}
              />
              {accounts.length > 1 ? (
                <div className="px-5 pb-2">
                  <label className="mb-1 block text-[11px] text-radius-text-muted">
                    Send from
                  </label>
                  <div className="relative w-fit">
                    <select
                      value={selectedFromEmail ?? ""}
                      onChange={(event) => setSelectedFromEmail(event.target.value)}
                      className="appearance-none rounded-full border border-radius-border-subtle bg-radius-bg-primary px-3 py-1.5 pr-8 text-[12px] text-radius-text-primary outline-none"
                    >
                      {accounts.map((account) => (
                        <option key={account.email} value={account.email}>
                          {account.name || account.email}
                        </option>
                      ))}
                    </select>
                    <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-radius-text-muted" />
                  </div>
                </div>
              ) : null}
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
                  onSuggestionError={() => {}}
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
                  onSuggestionError={() => {}}
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
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => handleFormatting("bold")} className="inline-flex items-center gap-1 rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-muted transition-colors hover:text-radius-text-primary">
                      <HugeiconsIcon icon={TextBoldIcon} size={12} />
                      Bold
                    </button>
                    <button type="button" onClick={() => handleFormatting("italic")} className="inline-flex items-center gap-1 rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-muted transition-colors hover:text-radius-text-primary">
                      <HugeiconsIcon icon={TextItalicIcon} size={12} />
                      Italic
                    </button>
                    <button type="button" onClick={() => handleFormatting("bullets")} className="inline-flex items-center gap-1 rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-muted transition-colors hover:text-radius-text-primary">
                      <span className="text-[12px] leading-none">•</span>
                      List
                    </button>
                    <button type="button" onClick={() => handleFormatting("numbers")} className="inline-flex items-center gap-1 rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-muted transition-colors hover:text-radius-text-primary">
                      <span className="text-[11px] leading-none">1.</span>
                      Steps
                    </button>
                    <button type="button" onClick={() => setSignatureOpen((current) => !current)} className="inline-flex items-center gap-1 rounded-full border border-radius-border-subtle px-2.5 py-1 text-[11px] text-radius-text-muted transition-colors hover:text-radius-text-primary">
                      <HugeiconsIcon icon={SignatureIcon} size={12} />
                      Signature
                    </button>
                  </div>
                  {signatureOpen && selectedFromAccount?.email ? (
                    <div className="mb-3 rounded-2xl border border-radius-border-subtle bg-radius-bg-secondary/40 p-3">
                      <label htmlFor={`${bodyId}-signature`} className="block text-[11px] text-radius-text-muted">
                        Signature for {selectedFromAccount.email}
                      </label>
                      <textarea
                        id={`${bodyId}-signature`}
                        value={activeSignature}
                        onChange={(event) => handleSignatureChange(event.target.value)}
                        placeholder="Add a signature for this account"
                        className="mt-2 min-h-[72px] w-full resize-none bg-transparent text-[12px] leading-relaxed text-radius-text-primary outline-none placeholder:text-radius-text-muted"
                      />
                    </div>
                  ) : null}
                  <label htmlFor={bodyId} className="sr-only">
                    Message body
                  </label>
                  <textarea
                    id={bodyId}
                    ref={bodyTextareaRef}
                    value={body}
                    onChange={(event) =>
                      setComposeState((current) => ({ ...current, body: event.target.value }))
                    }
                    placeholder="Write your message..."
                    className="min-h-[140px] w-full resize-none border-0 bg-transparent px-0 py-1 text-[13px] leading-relaxed text-radius-text-secondary outline-none placeholder:text-radius-text-muted focus:ring-0 focus-visible:ring-0"
                  />
                  <p className="mt-2 text-[10px] text-radius-text-muted">
                    Formatting is preserved when sent. Drag files anywhere into this window to attach them.
                  </p>
                </motion.div>
              </motion.div>
            </div>

            <ComposeAttachmentList attachments={attachments} onRemove={handleRemoveAttachment} />

            <motion.div layout className="flex items-center justify-between gap-3 px-5 py-3 border-t border-radius-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <ComposeAttachments onAddAttachment={handleAddAttachment} />
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-radius-text-muted">
                  <HugeiconsIcon icon={SentIcon} size={10} />
                  Ready
                </span>
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
