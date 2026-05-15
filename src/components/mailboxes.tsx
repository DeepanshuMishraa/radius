import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArchiveIcon,
  MailSend01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";

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
        <HugeiconsIcon icon={MailSend01Icon} />
        <span>Sent</span>
      </CommandItem>
      <CommandItem
        value="drafts"
        onSelect={() => onSelectMailbox("drafts")}
      >
        <HugeiconsIcon icon={ArchiveIcon} />
        <span>Drafts</span>
      </CommandItem>
      <CommandItem
        value="trash"
        onSelect={() => onSelectMailbox("trash")}
      >
        <HugeiconsIcon icon={Delete02Icon} />
        <span>Trash</span>
      </CommandItem>
    </CommandGroup>
  );
}
