import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  EnvelopeSimple,
  CaretDown,
  CheckCircle,
  Plus,
  Sparkle,
  UserPlus,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { radiusRpc } from "@/mainview/lib/rpc";

export interface ContactOption {
  name: string;
  email: string;
  label: string;
  source: "recent" | "account" | "manual";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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
  const [recipientQuery, setRecipientQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pendingAction, setPendingAction] = useState<"draft" | "send" | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<"explorer" | "navigator" | null>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedRecipients([]);
    setRecipientQuery("");
    setSubject("");
    setBody("");
    setPendingAction(null);
    setDraftSavedAt(null);
    setSelectedAgent(null);

    const timer = window.setTimeout(() => {
      recipientInputRef.current?.focus();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [open]);

  const filteredContacts = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    const selectedSet = new Set(selectedRecipients.map((item) => item.email.toLowerCase()));

    return contacts.filter((contact) => {
      if (selectedSet.has(contact.email.toLowerCase())) return false;
      if (!query) return true;
      return (
        contact.name.toLowerCase().includes(query) ||
        contact.email.toLowerCase().includes(query)
      );
    });
  }, [contacts, recipientQuery, selectedRecipients]);

  const addRecipient = useCallback((contact: ContactOption) => {
    setSelectedRecipients((current) => {
      if (current.some((item) => item.email.toLowerCase() === contact.email.toLowerCase())) {
        return current;
      }
      return [...current, contact];
    });
    setRecipientQuery("");
    recipientInputRef.current?.focus();
  }, []);

  const removeRecipient = useCallback((email: string) => {
    setSelectedRecipients((current) =>
      current.filter((item) => item.email.toLowerCase() !== email.toLowerCase())
    );
  }, []);

  const commitManualRecipient = useCallback(() => {
    const value = recipientQuery.trim().replace(/,$/, "");
    if (!value) return;
    if (!isValidEmail(value)) {
      toast.error("Enter a valid email address");
      return;
    }

    addRecipient({
      name: value,
      email: value,
      label: value,
      source: "manual",
    });
  }, [addRecipient, recipientQuery]);

  const handleComposeAction = useCallback(
    async (action: "draft" | "send") => {
      if (!fromAccount?.email) {
        toast.error("Connect a Gmail account before composing");
        return;
      }

      const payload = {
        from: fromAccount.email,
        to: selectedRecipients.map((item) => item.email),
        subject: subject.trim(),
        bodyText: body.trim(),
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
    [body, fromAccount, onClose, selectedRecipients, subject]
  );

  if (!open) return null;

  const draftLabel =
    pendingAction === "draft"
      ? "SAVING"
      : draftSavedAt
        ? "SAVED"
        : "DRAFT";
  const canSubmit =
    Boolean(fromAccount?.email) &&
    selectedRecipients.length > 0 &&
    (subject.trim().length > 0 || body.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-[640px] rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <EnvelopeSimple size={18} weight="regular" className="text-gray-700" />
            <h2 className="text-[15px] font-medium text-gray-900">Compose email</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close compose"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-6 pb-5">
          {/* From */}
          <div className="flex items-center gap-3">
            <span className="w-10 text-[13px] text-gray-400">From</span>
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[10px] font-semibold text-blue-600">
                {fromAccount?.name?.slice(0, 1).toUpperCase() ?? "R"}
              </div>
              <span className="text-[13px] text-gray-900">
                {fromAccount?.name || fromAccount?.email || "No active account"}
              </span>
              <CheckCircle size={14} weight="fill" className="text-blue-500" />
            </div>
          </div>

          {/* To */}
          <div className="mt-3 flex items-start gap-3">
            <span className="w-10 pt-1.5 text-[13px] text-gray-400">To</span>
            <div className="flex min-h-[34px] flex-1 flex-wrap items-center gap-1.5">
              {selectedRecipients.map((recipient) => (
                <button
                  key={recipient.email}
                  type="button"
                  onClick={() => removeRecipient(recipient.email)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                  title="Remove recipient"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[9px] font-medium text-gray-600">
                    {(recipient.name || recipient.email).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[12px] text-gray-900">{recipient.name}</span>
                  <CheckCircle size={12} weight="fill" className="text-blue-500" />
                </button>
              ))}

              <div className="flex min-w-[140px] flex-1 items-center gap-1.5">
                <UserPlus size={14} className="text-gray-400 shrink-0" />
                <input
                  ref={recipientInputRef}
                  value={recipientQuery}
                  onChange={(event) => setRecipientQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
                      if (recipientQuery.trim()) {
                        event.preventDefault();
                        commitManualRecipient();
                      }
                    } else if (
                      event.key === "Backspace" &&
                      !recipientQuery &&
                      selectedRecipients.length > 0
                    ) {
                      removeRecipient(selectedRecipients[selectedRecipients.length - 1].email);
                    }
                  }}
                  placeholder="Select person"
                  className="min-w-[100px] flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 h-px bg-gray-100" />

          {/* Agent */}
          <div className="mb-4">
            <span className="text-[13px] text-gray-400">Agent</span>
            <div className="mt-1.5 space-y-0.5">
              <button
                type="button"
                onClick={() => setSelectedAgent("explorer")}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${selectedAgent === "explorer" ? "bg-gray-50" : "hover:bg-gray-50"}`}
              >
                <span className="flex h-7 w-7 items-center justify-center text-[14px]">🧩</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-pink-500">Explorer</span>
                  <span className="text-[13px] text-gray-400">A new adventure</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedAgent("navigator")}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${selectedAgent === "navigator" ? "bg-gray-50" : "hover:bg-gray-50"}`}
              >
                <span className="flex h-7 w-7 items-center justify-center text-[14px]">🧭</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-sky-500">Navigator</span>
                  <span className="text-[13px] text-gray-400">Charting unknown territories</span>
                </div>
              </button>
            </div>
          </div>

          {/* Suggested */}
          <div className="mb-4">
            <span className="text-[13px] text-gray-400">Suggested</span>
            <div className="mt-1">
              {filteredContacts.slice(0, 6).map((contact) => (
                <button
                  key={contact.email}
                  type="button"
                  onClick={() => addRecipient(contact)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
                    {(contact.name || contact.email).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[13px] text-gray-900">{contact.name}</span>
                </button>
              ))}
              {filteredContacts.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 px-2 py-2.5">
                  <p className="text-[11px] text-gray-400">Type any email address to add a recipient.</p>
                </div>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="border-t border-gray-100 pt-3">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              className="h-9 w-full bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>

          {/* Body */}
          <div className="pt-1">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message..."
              className="min-h-[80px] resize-none rounded-lg border-0 bg-transparent px-0 py-2 text-[13px] leading-5 text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 focus-visible:ring-0"
            />
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 opacity-60"
                aria-label="Attachments coming soon"
                title="Attachments coming soon"
              >
                <Plus size={16} />
              </button>
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5">
                <Sparkle size={14} className="text-amber-500" weight="fill" />
                <span className="text-[12px] text-gray-700">Opus 4.5</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                <span className="text-[11px] font-medium tracking-wide text-blue-500">
                  {draftLabel}
                </span>
              </div>

              <div className="inline-flex overflow-hidden rounded-lg bg-gray-900 text-white">
                <button
                  type="button"
                  disabled={!canSubmit || pendingAction !== null}
                  onClick={() => void handleComposeAction("send")}
                  className="inline-flex h-9 items-center gap-2 px-4 text-[13px] font-medium hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === "send" ? (
                    <>
                      <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      <span>Sending</span>
                    </>
                  ) : (
                    <span>Send</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!canSubmit || pendingAction !== null}
                  onClick={() => void handleComposeAction("draft")}
                  className="inline-flex h-9 items-center border-l border-white/10 px-2.5 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Save draft"
                  title="Save draft"
                >
                  {pendingAction === "draft" ? (
                    <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                  ) : (
                    <CaretDown size={12} weight="bold" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
