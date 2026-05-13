import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Sun02Icon,
  Search01Icon,
  RefreshIcon,
  UserCircleIcon,
  InformationCircleIcon,
  Mail01Icon,
  InboxIcon,
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
}: HomeProps) {
  return (
    <>
      <CommandGroup heading="Email">
        <CommandItem
          value="compose-email"
          onSelect={onComposeEmail}
        >
          <HugeiconsIcon icon={Mail01Icon} />
          <span>Compose Email</span>
        </CommandItem>
        <CommandItem
          value="search-emails"
          onSelect={onSearchEmails}
        >
          <HugeiconsIcon icon={Search01Icon} />
          <span>Search Emails</span>
        </CommandItem>
        <CommandItem
          value="mailroom"
          onSelect={onOpenMailroom}
        >
          <HugeiconsIcon icon={InboxIcon} />
          <span>Mailroom</span>
        </CommandItem>
        <CommandItem
          value="show-inbox"
          onSelect={onShowInbox}
        >
          <HugeiconsIcon icon={Home01Icon} />
          <span>Show Inbox</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="Workspace">
        <CommandItem
          value="accounts"
          onSelect={onSelectAccounts}
        >
          <HugeiconsIcon icon={UserCircleIcon} />
          <span>Accounts</span>
        </CommandItem>
        <CommandItem
          value="toggle-theme"
          onSelect={onSelectTheme}
        >
          <HugeiconsIcon icon={Sun02Icon} />
          <span>Toggle Theme</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="System">
        <CommandItem
          value="resync-account"
          onSelect={onResync}
        >
          <HugeiconsIcon icon={CloudDownloadIcon} />
          <span>Resync Account</span>
        </CommandItem>
        <CommandItem
          value="check-updates"
          onSelect={onCheckForUpdates}
        >
          <HugeiconsIcon icon={RefreshIcon} />
          <span>Check for Updates</span>
        </CommandItem>
        <CommandItem
          value="about-radius"
          onSelect={onAbout}
        >
          <HugeiconsIcon icon={InformationCircleIcon} />
          <span>About Radius</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
