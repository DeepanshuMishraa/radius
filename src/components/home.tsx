import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  SunDimIcon,
  MagnifyingGlassIcon,
  ArrowsClockwiseIcon,
  UserCircleIcon,
  InfoIcon,
  EnvelopeSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";

interface HomeProps {
  selectedValue: string;
  onSelectTheme: () => void;
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onSelectAccounts: () => void;
  onAbout: () => void;
}

export function Home({
  selectedValue,
  onSelectTheme,
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onSelectAccounts,
  onAbout,
}: HomeProps) {
  return (
    <CommandGroup heading="Suggestions">
      <CommandItem
        active={selectedValue === "toggle-theme"}
        value="toggle-theme"
        onSelect={onSelectTheme}
      >
        <SunDimIcon />
        <span>Toggle Theme</span>
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
        active={selectedValue === "compose-email"}
        value="compose-email"
        onSelect={onComposeEmail}
      >
        <EnvelopeSimpleIcon />
        <span>Compose Email</span>
      </CommandItem>
      <CommandItem
        active={selectedValue === "check-updates"}
        value="check-updates"
        onSelect={onCheckForUpdates}
      >
        <ArrowsClockwiseIcon />
        <span>Check for Updates</span>
      </CommandItem>
      <CommandItem
        active={selectedValue === "accounts"}
        value="accounts"
        onSelect={onSelectAccounts}
      >
        <UserCircleIcon />
        <span>Accounts</span>
      </CommandItem>
      <CommandItem active={selectedValue === "about"} value="about" onSelect={onAbout}>
        <InfoIcon />
        <span>About</span>
      </CommandItem>
    </CommandGroup>
  );
}
