import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  SunDimIcon,
  MagnifyingGlassIcon,
  ArrowsClockwiseIcon,
  UserCircleIcon,
  InfoIcon,
  EnvelopeSimpleIcon,
  TrayIcon,
  HouseIcon,
  CloudArrowDownIcon,
} from "@phosphor-icons/react/dist/ssr";

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
          <EnvelopeSimpleIcon />
          <span>Compose Email</span>
        </CommandItem>
        <CommandItem
          value="search-emails"
          onSelect={onSearchEmails}
        >
          <MagnifyingGlassIcon />
          <span>Search Emails</span>
        </CommandItem>
        <CommandItem
          value="mailroom"
          onSelect={onOpenMailroom}
        >
          <TrayIcon />
          <span>Mailroom</span>
        </CommandItem>
        <CommandItem
          value="show-inbox"
          onSelect={onShowInbox}
        >
          <HouseIcon />
          <span>Show Inbox</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="Workspace">
        <CommandItem
          value="accounts"
          onSelect={onSelectAccounts}
        >
          <UserCircleIcon />
          <span>Accounts</span>
        </CommandItem>
        <CommandItem
          value="toggle-theme"
          onSelect={onSelectTheme}
        >
          <SunDimIcon />
          <span>Toggle Theme</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="System">
        <CommandItem
          value="resync-account"
          onSelect={onResync}
        >
          <CloudArrowDownIcon />
          <span>Resync Account</span>
        </CommandItem>
        <CommandItem
          value="check-updates"
          onSelect={onCheckForUpdates}
        >
          <ArrowsClockwiseIcon />
          <span>Check for Updates</span>
        </CommandItem>
        <CommandItem
          value="about-radius"
          onSelect={onAbout}
        >
          <InfoIcon />
          <span>About Radius</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
