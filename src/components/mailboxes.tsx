import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { Archive01Icon, MailSend01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

type Mailbox = "sent" | "drafts" | "trash";

interface MailboxesProps {
  onSelectMailbox: (mailbox: Mailbox) => void;
}

export function Mailboxes({ onSelectMailbox }: MailboxesProps) {
  return (
    <CommandGroup heading="Mailroom">
      <CommandItem
        value="sent"
        onSelect={() => onSelectMailbox("sent")}
      >
          <HugeiconsIcon icon={MailSend01Icon} size={16} />
        <span>Sent</span>
      </CommandItem>
      <CommandItem
        value="drafts"
        onSelect={() => onSelectMailbox("drafts")}
      >
          <HugeiconsIcon icon={Archive01Icon} size={16} />
        <span>Drafts</span>
      </CommandItem>
      <CommandItem
        value="trash"
        onSelect={() => onSelectMailbox("trash")}
      >
          <HugeiconsIcon icon={Delete01Icon} size={16} />
        <span>Trash</span>
      </CommandItem>
    </CommandGroup>
  );
}
