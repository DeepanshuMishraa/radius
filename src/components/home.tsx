import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Sun01Icon,
  Search01Icon,
  Refresh01Icon,
  UserCircleIcon,
  InformationCircleIcon,
  Mail01Icon,
  Mailbox01Icon,
  Home01Icon,
  CloudDownloadIcon,
} from "@hugeicons/core-free-icons";

interface HomeProps {
  onSelectTheme: () => void;
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onSelectAccounts: () => void;
  onAbout: () => void;
  onOpenMailroom: () => void;
  onShowInbox: () => void;
  onResync: () => void;
  onReconnect: () => void;
}

export function Home({
  onSelectTheme,
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onSelectAccounts,
  onAbout,
  onOpenMailroom,
  onShowInbox,
  onResync,
  onReconnect,
}: HomeProps) {
  return (
    <>
      <CommandGroup heading="Email">
        <CommandItem
          value="compose-email"
          onSelect={onComposeEmail}
        >
          <HugeiconsIcon icon={Mail01Icon} size={16} />
          <span>Compose Email</span>
          <CommandShortcut>C</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="search-emails"
          onSelect={onSearchEmails}
        >
          <HugeiconsIcon icon={Search01Icon} size={16} />
          <span>Search Emails</span>
          <CommandShortcut>/</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="mailboxes"
          onSelect={onOpenMailroom}
        >
          <HugeiconsIcon icon={Mailbox01Icon} size={16} />
          <span>Mailboxes</span>
        </CommandItem>
        <CommandItem
          value="show-inbox"
          onSelect={onShowInbox}
        >
          <HugeiconsIcon icon={Home01Icon} size={16} />
          <span>Show Inbox</span>
          <CommandShortcut>G I</CommandShortcut>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="Workspace">
        <CommandItem
          value="accounts"
          onSelect={onSelectAccounts}
        >
          <HugeiconsIcon icon={UserCircleIcon} size={16} />
          <span>Accounts</span>
        </CommandItem>
        <CommandItem
          value="toggle-theme"
          onSelect={onSelectTheme}
        >
          <HugeiconsIcon icon={Sun01Icon} size={16} />
          <span>Toggle Theme</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="System">
        <CommandItem
          value="resync-account"
          onSelect={onResync}
        >
          <HugeiconsIcon icon={CloudDownloadIcon} size={16} />
          <span>Resync Account</span>
        </CommandItem>
        <CommandItem
          value="reconnect-account"
          onSelect={onReconnect}
        >
          <HugeiconsIcon icon={Refresh01Icon} size={16} />
          <span>Reconnect Account</span>
        </CommandItem>
        <CommandItem
          value="check-updates"
          onSelect={onCheckForUpdates}
        >
          <HugeiconsIcon icon={Refresh01Icon} size={16} />
          <span>Check for Updates</span>
        </CommandItem>
        <CommandItem
          value="about-radius"
          onSelect={onAbout}
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={16} />
          <span>About Radius</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
