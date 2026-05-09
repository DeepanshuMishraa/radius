import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  ArchiveBoxIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";

type Mailbox = "sent" | "drafts" | "trash";

interface MailboxesProps {
  selectedValue: string;
  onSelectMailbox: (mailbox: Mailbox) => void;
}

export function Mailboxes({ selectedValue, onSelectMailbox }: MailboxesProps) {
  return (
    <CommandGroup heading="Mailroom">
      <CommandItem
        active={selectedValue === "sent"}
        value="sent"
        onSelect={() => onSelectMailbox("sent")}
      >
        <PaperPlaneTiltIcon />
        <span>Sent</span>
      </CommandItem>
      <CommandItem
        active={selectedValue === "drafts"}
        value="drafts"
        onSelect={() => onSelectMailbox("drafts")}
      >
        <ArchiveBoxIcon />
        <span>Drafts</span>
      </CommandItem>
      <CommandItem
        active={selectedValue === "trash"}
        value="trash"
        onSelect={() => onSelectMailbox("trash")}
      >
        <TrashIcon />
        <span>Trash</span>
      </CommandItem>
    </CommandGroup>
  );
}
