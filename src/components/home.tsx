import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Refresh01Icon,
  Mail01Icon,
  Mailbox01Icon,
  Home01Icon,
  CloudDownloadIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";

interface HomeProps {
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onOpenSettings: () => void;
  onOpenMailroom: () => void;
  onShowInbox: () => void;
  onResync: () => void;
  onReconnect: () => void;
}

export function Home({
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onOpenSettings,
  onOpenMailroom,
  onShowInbox,
  onResync,
  onReconnect,
}: HomeProps) {
  return (
    <>
      <CommandGroup heading="Email">
        <CommandItem value="compose-email" onSelect={onComposeEmail}>
          <HugeiconsIcon icon={Mail01Icon} size={16} />
          <span>Compose Email</span>
        </CommandItem>
        <CommandItem value="search-emails" onSelect={onSearchEmails}>
          <HugeiconsIcon icon={Search01Icon} size={16} />
          <span>Search Emails</span>
        </CommandItem>
        <CommandItem value="mailroom" onSelect={onOpenMailroom}>
          <HugeiconsIcon icon={Mailbox01Icon} size={16} />
          <span>Mailroom</span>
        </CommandItem>
        <CommandItem value="show-inbox" onSelect={onShowInbox}>
          <HugeiconsIcon icon={Home01Icon} size={16} />
          <span>Show Inbox</span>
        </CommandItem>
      </CommandGroup>

      <CommandGroup heading="System">
        <CommandItem value="settings" onSelect={onOpenSettings}>
          <HugeiconsIcon icon={Settings01Icon} size={16} />
          <span>Settings</span>
        </CommandItem>
        <CommandItem value="resync-account" onSelect={onResync}>
          <HugeiconsIcon icon={CloudDownloadIcon} size={16} />
          <span>Resync Account</span>
        </CommandItem>
        <CommandItem value="reconnect-account" onSelect={onReconnect}>
          <HugeiconsIcon icon={Refresh01Icon} size={16} />
          <span>Reconnect Account</span>
        </CommandItem>
        <CommandItem value="check-updates" onSelect={onCheckForUpdates}>
          <HugeiconsIcon icon={Refresh01Icon} size={16} />
          <span>Check for Updates</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
