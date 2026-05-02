import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useTheme } from "./theme-provider";
import {
  SunDimIcon,
  MagnifyingGlassIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react/dist/ssr";

interface CommandKProps {
  onSearchEmails: () => void;
  onCheckForUpdates: () => void;
}

export function CommandK({ onSearchEmails, onCheckForUpdates }: CommandKProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { setTheme, theme } = useTheme();

  React.useEffect(() => {
    // Ensure the input is focused when the dialog opens
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    // Explicitly handle Cmd+A / Ctrl+A to select all text in the input
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      inputRef.current?.select();
    }
  }, []);

  return (
    <Command
      className="w-full max-w-xl border border-radius-border-subtle"
      onKeyDown={handleKeyDown}
    >
      <CommandInput
        ref={inputRef}
        placeholder="Type a command or search..."
        autoFocus
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem
            onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <SunDimIcon />
            <span>Toggle Theme</span>
          </CommandItem>
          <CommandItem onSelect={onSearchEmails}>
            <MagnifyingGlassIcon />
            <span>Search Emails</span>
          </CommandItem>
          <CommandItem onSelect={onCheckForUpdates}>
            <ArrowsClockwiseIcon />
            <span>Check for Updates</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
