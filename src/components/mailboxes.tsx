import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit01Icon, MailSend01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

type Mailbox = "sent" | "drafts" | "trash";

interface MailboxesProps {
  provider: "gmail" | "imap";
  onSelectMailbox: (mailbox: Mailbox) => void;
}

export function Mailboxes({ provider, onSelectMailbox }: MailboxesProps) {
  return (
    <CommandGroup heading="Mailroom">
      {provider !== "imap" && (
        <CommandItem
          value="sent"
          onSelect={() => onSelectMailbox("sent")}
        >
            <HugeiconsIcon icon={MailSend01Icon} size={16} />
          <span>Sent</span>
        </CommandItem>
      )}
      {provider !== "imap" && (
        <CommandItem
          value="drafts"
          onSelect={() => onSelectMailbox("drafts")}
        >
            <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
          <span>Drafts</span>
        </CommandItem>
      )}
      {provider !== "imap" && (
        <CommandItem
          value="trash"
          onSelect={() => onSelectMailbox("trash")}
        >
            <HugeiconsIcon icon={Delete01Icon} size={16} />
          <span>Trash</span>
        </CommandItem>
      )}
    </CommandGroup>
  );
}
