import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import {
  SunDimIcon,
  MagnifyingGlassIcon,
  ArrowsClockwiseIcon,
  UserCircleIcon,
  InfoIcon,
  EnvelopeSimpleIcon,
  TrayIcon,
  HouseIcon,
} from "@phosphor-icons/react/dist/ssr";

interface HomeProps {
  selectedValue: string;
  onSelectTheme: () => void;
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onSelectAccounts: () => void;
  onAbout: () => void;
  onOpenMailroom: () => void;
  onShowInbox: () => void;
}

export function Home({
  selectedValue,
  onSelectTheme,
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onSelectAccounts,
  onAbout,
  onOpenMailroom,
  onShowInbox,
}: HomeProps) {
  return (
    <>
      <CommandGroup heading="Email">
        <CommandItem
          active={selectedValue === "compose-email"}
          value="compose-email"
          onSelect={onComposeEmail}
        >
          <EnvelopeSimpleIcon />
          <span>Compose Email</span>
        </CommandItem>
        <CommandItem
          active={selectedValue === "search-emails"}
          value="search-emails"
          onSelect={onSearchEmails}
        >
          <MagnifyingGlassIcon />
          <span>Search Emails</span>
        </CommandItem>
        <CommandItem
          active={selectedValue === "mailroom"}
          value="mailroom"
          onSelect={onOpenMailroom}
        >
          <TrayIcon />
          <span>Mailroom</span>
        </CommandItem>
        <CommandItem
          active={selectedValue === "show-inbox"}
          value="show-inbox"
          onSelect={onShowInbox}
        >
          <HouseIcon />
          <span>Show Inbox</span>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Workspace">
        <CommandItem
          active={selectedValue === "accounts"}
          value="accounts"
          onSelect={onSelectAccounts}
        >
          <UserCircleIcon />
          <span>Accounts</span>
        </CommandItem>
        <CommandItem
          active={selectedValue === "toggle-theme"}
          value="toggle-theme"
          onSelect={onSelectTheme}
        >
          <SunDimIcon />
          <span>Toggle Theme</span>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="System">
        <CommandItem
          active={selectedValue === "check-updates"}
          value="check-updates"
          onSelect={onCheckForUpdates}
        >
          <ArrowsClockwiseIcon />
          <span>Check for Updates</span>
        </CommandItem>
        <CommandItem active={selectedValue === "about"} value="about" onSelect={onAbout}>
          <InfoIcon />
          <span>About</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
