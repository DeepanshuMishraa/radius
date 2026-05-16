import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle01Icon, Cancel01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { radiusRpc } from "@/mainview/lib/rpc";
import { type ContactOption, isValidEmail } from "./types";

interface ComposeRecipientsProps {
  fromAccount: { email: string; name: string } | null;
  contacts: ContactOption[];
  selectedRecipients: ContactOption[];
  setSelectedRecipients: React.Dispatch<React.SetStateAction<ContactOption[]>>;
  locked?: boolean;
}

export function ComposeRecipients({
  fromAccount,
  contacts,
  selectedRecipients,
  setSelectedRecipients,
  locked = false,
}: ComposeRecipientsProps) {
  const [recipientQuery, setRecipientQuery] = useState("");
  const [isRecipientFocused, setIsRecipientFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<ContactOption[]>([]);
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (locked) return;
    const timer = window.setTimeout(() => {
      recipientInputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [locked]);

  useEffect(() => {
    if (locked || !isRecipientFocused) return;
    const currentRequestId = ++requestIdRef.current;
    const query = recipientQuery.trim();
    const timer = window.setTimeout(() => {
      void radiusRpc.request
        .getComposeSuggestions({
          query,
          limit: query ? 8 : 6,
        })
        .then((result) => {
          if (requestIdRef.current !== currentRequestId) return;
          setRemoteSuggestions(
            result.contacts.map((contact) => ({
              name: contact.name,
              email: contact.email,
              label: contact.label,
              source: contact.source,
            })),
          );
        })
        .catch((error) => {
          console.error("Failed to fetch compose suggestions:", error);
        });
    }, query ? 120 : 0);

    return () => window.clearTimeout(timer);
  }, [isRecipientFocused, locked, recipientQuery]);

  const filteredContacts = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    const selectedSet = new Set(selectedRecipients.map((item) => item.email.toLowerCase()));
    const merged = [...remoteSuggestions, ...contacts];
    const deduped: ContactOption[] = [];
    const seen = new Set<string>();

    for (const contact of merged) {
      const normalized = contact.email.toLowerCase();
      if (seen.has(normalized) || selectedSet.has(normalized)) continue;
      if (
        query &&
        !contact.name.toLowerCase().includes(query) &&
        !contact.email.toLowerCase().includes(query)
      ) {
        continue;
      }
      seen.add(normalized);
      deduped.push(contact);
    }

    return deduped;
  }, [contacts, recipientQuery, remoteSuggestions, selectedRecipients]);

  const addRecipient = (contact: ContactOption) => {
    setSelectedRecipients((current) => {
      if (current.some((item) => item.email.toLowerCase() === contact.email.toLowerCase())) {
        return current;
      }
      return [...current, contact];
    });
    setRecipientQuery("");
    recipientInputRef.current?.focus();
  };

  const removeRecipient = (email: string) => {
    setSelectedRecipients((current) =>
      current.filter((item) => item.email.toLowerCase() !== email.toLowerCase())
    );
  };

  const commitManualRecipient = () => {
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
  };

  return (
    <motion.div layout className="px-5 pb-4">
      {/* From */}
      <motion.div layout className="flex items-center gap-3">
        <span className="w-8 text-[12px] text-radius-text-muted">From</span>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-radius-border-subtle bg-radius-bg-primary px-2 py-0.5 shadow-sm">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[9px] font-medium text-blue-600">
            {fromAccount?.name?.slice(0, 1).toUpperCase() ?? "R"}
          </div>
          <span className="text-[12px] text-radius-text-primary font-medium tracking-tight">
            {fromAccount?.name || fromAccount?.email || "No active account"}
          </span>
          <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} className="text-[#1d9bf0]" />
        </div>
      </motion.div>

      {/* To */}
      <motion.div layout className="mt-2 flex items-start gap-3">
        <span className="w-8 pt-1.5 text-[12px] text-radius-text-muted">To</span>
        <div className="flex min-h-[28px] flex-1 flex-wrap items-center gap-1.5">
          <AnimatePresence>
            {selectedRecipients.map((recipient) => (
              <motion.button
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                key={recipient.email}
                type="button"
                whileHover={{ scale: 0.97 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => removeRecipient(recipient.email)}
                className={`group inline-flex items-center gap-1.5 rounded-full border border-radius-border-subtle bg-radius-bg-primary px-2 py-0.5 shadow-sm origin-center transition-colors ${
                  locked
                    ? "cursor-default"
                    : "hover:border-radius-error/40 hover:bg-radius-error/5"
                }`}
                title={locked ? "Recipient is fixed for this draft" : "Remove recipient"}
                disabled={locked}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-radius-bg-secondary text-[9px] font-medium text-radius-text-primary group-hover:bg-radius-error/20 group-hover:text-radius-error transition-colors">
                  {(recipient.name || recipient.email).slice(0, 1).toUpperCase()}
                </div>
                <span className={`text-[12px] font-medium tracking-tight transition-colors ${
                  locked ? "text-radius-text-primary" : "text-radius-text-primary group-hover:text-radius-error"
                }`}>{recipient.name}</span>
                <div className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    size={14}
                    className={`absolute text-[#1d9bf0] transition-opacity duration-200 ${
                      locked ? "" : "group-hover:opacity-0"
                    }`}
                  />
                  {!locked ? (
                    <HugeiconsIcon icon={Cancel01Icon} size={12} className="absolute text-radius-error opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  ) : null}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>

          {!locked ? (
            <motion.div layout className="flex min-w-[140px] flex-1 items-center gap-1.5">
              <HugeiconsIcon icon={UserAdd01Icon} size={14} className="text-radius-text-muted shrink-0" />
              <input
                ref={recipientInputRef}
                value={recipientQuery}
                onFocus={() => setIsRecipientFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsRecipientFocused(false), 150);
                }}
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
                className="min-w-[100px] flex-1 bg-transparent text-[12px] text-radius-text-primary outline-none placeholder:text-radius-text-muted py-1"
              />
            </motion.div>
          ) : (
            <span className="text-[11px] text-radius-text-muted py-1">
              Recipient is fixed for this message
            </span>
          )}
        </div>
      </motion.div>

      {/* Collapsible Suggested */}
      <AnimatePresence>
        {isRecipientFocused && filteredContacts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-0.5">
              {filteredContacts.slice(0, 4).map((contact) => (
                <motion.button
                  key={contact.email}
                  type="button"
                  whileHover={{ backgroundColor: "var(--radius-bg-secondary)" }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => addRecipient(contact)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left transition-colors"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-radius-bg-secondary border border-radius-border-subtle text-[9px] font-medium text-radius-text-primary shadow-sm">
                    {(contact.name || contact.email).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[12px] text-radius-text-primary font-medium">{contact.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
