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
  UserCircleIcon,
  ArrowLeftIcon,
  PlusIcon,
  CheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Account } from "@/mainview/hooks/useInbox";

interface CommandKProps {
  onSearchEmails: () => void;
  onCheckForUpdates: () => void;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
  accounts: Account[];
  activeAccount: string | null;
}

type Page = "home" | "accounts";

export function CommandK({
  onSearchEmails,
  onCheckForUpdates,
  onSwitchAccount,
  onAddAccount,
  accounts,
  activeAccount,
}: CommandKProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { setTheme, theme } = useTheme();
  const [page, setPage] = React.useState<Page>("home");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [page]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && page !== "home") {
        e.preventDefault();
        setPage("home");
        setSearch("");
      }
    },
    [page]
  );

  const handleBack = React.useCallback(() => {
    setPage("home");
    setSearch("");
  }, []);

  return (
    <Command
      className="w-full max-w-xl border border-radius-border-subtle overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {page === "accounts" && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-radius-border-subtle">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
            aria-label="Back"
          >
            <ArrowLeftIcon size={14} />
          </button>
          <span className="text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
            Accounts
          </span>
        </div>
      )}
      <CommandInput
        ref={inputRef}
        placeholder={
          page === "home"
            ? "Type a command or search..."
            : "Search accounts..."
        }
        autoFocus
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {page === "home" ? (
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
            <CommandItem onSelect={() => setPage("accounts")}>
              <UserCircleIcon />
              <span>Accounts</span>
            </CommandItem>
          </CommandGroup>
        ) : (
          <>
            <CommandGroup heading="Your accounts">
              {accounts.map((account) => (
                <CommandItem
                  key={account.email}
                  onSelect={() => {
                    if (account.email !== activeAccount) {
                      onSwitchAccount(account.email);
                    }
                  }}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    <UserCircleIcon />
                    <span className="text-sm">{account.email}</span>
                  </div>
                  {account.email === activeAccount && (
                    <CheckIcon size={14} className="text-radius-accent" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={onAddAccount}>
                <PlusIcon />
                <span>Add Account</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
