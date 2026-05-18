import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit01Icon, MailSend01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

type Mailbox = "sent" | "drafts" | "trash";

interface MailboxesProps {
  onSelectMailbox: (mailbox: Mailbox) => void;
}

export function Mailboxes({ onSelectMailbox }: MailboxesProps) {
  return (
    <CommandGroup heading="Mailboxes">
      <CommandItem
        value="sent"
        onSelect={() => onSelectMailbox("sent")}
      >
          <HugeiconsIcon icon={MailSend01Icon} size={16} />
        <span>Sent</span>
        <CommandShortcut>G S</CommandShortcut>
      </CommandItem>
      <CommandItem
        value="drafts"
        onSelect={() => onSelectMailbox("drafts")}
      >
          <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
        <span>Drafts</span>
        <CommandShortcut>G D</CommandShortcut>
      </CommandItem>
      <CommandItem
        value="trash"
        onSelect={() => onSelectMailbox("trash")}
      >
          <HugeiconsIcon icon={Delete01Icon} size={16} />
        <span>Trash</span>
        <CommandShortcut>G T</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  );
}
