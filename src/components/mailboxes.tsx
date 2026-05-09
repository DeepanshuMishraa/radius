import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  ArchiveBoxIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";

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
        <PaperPlaneTiltIcon />
        <span>Sent</span>
      </CommandItem>
      <CommandItem
        value="drafts"
        onSelect={() => onSelectMailbox("drafts")}
      >
        <ArchiveBoxIcon />
        <span>Drafts</span>
      </CommandItem>
      <CommandItem
        value="trash"
        onSelect={() => onSelectMailbox("trash")}
      >
        <TrashIcon />
        <span>Trash</span>
      </CommandItem>
    </CommandGroup>
  );
}
