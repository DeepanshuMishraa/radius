import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
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
  TrashIcon,
  InfoIcon,
  EnvelopeSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { Account } from "@/mainview/hooks/useInbox";

interface CommandKProps {
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
  onAbout: () => void;
  accounts: Account[];
  activeAccount: string | null;
}

type Page = "home" | "accounts" | "themes";

export function CommandK({
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  onAbout,
  accounts,
  activeAccount,
}: CommandKProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { setTheme, theme, themes } = useTheme();
  const [page, setPage] = React.useState<Page>("home");
  const [search, setSearch] = React.useState("");
  const [selectedValue, setSelectedValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (page === "home") {
      setSelectedValue((current) => current || "toggle-theme");
      return;
    }

    if (page === "accounts") {
      const nextValue = accounts[0]?.email ?? "add-account";
      setSelectedValue((current) => current || nextValue);
      return;
    }

    const nextThemeValue = themes[0]?.name ?? "";
    setSelectedValue((current) => current || nextThemeValue);
  }, [accounts, page, themes]);

  React.useEffect(() => {
    setSelectedValue("");
  }, [page]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [page]);

  const selectedAccount = React.useMemo(
    () => accounts.find((a) => a.email === selectedValue) ?? null,
    [accounts, selectedValue]
  );

  useHotkey(
    "D",
    (e) => {
      if (page !== "accounts" || !selectedAccount || deleteTarget) return;
      e.preventDefault();
      setDeleteTarget(selectedAccount.email);
    },
    {
      enabled: page === "accounts" && !!selectedAccount && !deleteTarget,
      ignoreInputs: false,
    }
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && page !== "home") {
        if (deleteTarget) {
          e.preventDefault();
          setDeleteTarget(null);
          return;
        }
        e.preventDefault();
        setPage("home");
        setSearch("");
      }
    },
    [page, deleteTarget]
  );

  const handleBack = React.useCallback(() => {
    if (deleteTarget) {
      setDeleteTarget(null);
      return;
    }
    setPage("home");
    setSearch("");
  }, [deleteTarget]);

  const handleConfirmDelete = React.useCallback(() => {
    if (!deleteTarget) return;
    onRemoveAccount(deleteTarget);
    setDeleteTarget(null);
    setSearch("");
  }, [deleteTarget, onRemoveAccount]);

  return (
    <Command
      value={selectedValue}
      onValueChange={setSelectedValue}
      className="w-full max-w-xl border border-radius-border-subtle overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {page !== "home" && (
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
            {page === "accounts" ? "Accounts" : "Themes"}
          </span>
        </div>
      )}
      {deleteTarget && (
        <div className="mx-3 mt-2 mb-1 rounded-lg border border-radius-error/30 bg-radius-error/5 p-3">
          <div className="flex items-center gap-2">
            <TrashIcon size={14} className="text-radius-error shrink-0" />
            <p className="text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
              Delete account?
            </p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
            {deleteTarget}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="inline-flex items-center rounded-md border border-radius-border-subtle bg-transparent px-2.5 py-1 text-[11px] font-medium text-radius-text-secondary transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary font-[family-name:var(--font-family-sans)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="inline-flex items-center rounded-md bg-radius-error px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:opacity-90 font-[family-name:var(--font-family-sans)]"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <div className={page !== "home" ? "sr-only" : undefined}>
        <CommandInput
          ref={inputRef}
          placeholder={page === "home" ? "Type a command or search..." : ""}
          autoFocus
          value={search}
          onValueChange={setSearch}
        />
      </div>
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {page === "home" ? (
          <CommandGroup heading="Suggestions">
            <CommandItem
              active={selectedValue === "toggle-theme"}
              value="toggle-theme"
              onSelect={() => {
                setPage("themes");
                setSearch("");
              }}
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
              onSelect={() => setPage("accounts")}
            >
              <UserCircleIcon />
              <span>Accounts</span>
            </CommandItem>
            <CommandItem active={selectedValue === "about"} value="about" onSelect={onAbout}>
              <InfoIcon />
              <span>About</span>
            </CommandItem>
          </CommandGroup>
        ) : page === "accounts" ? (
          <>
            <CommandGroup heading="Your accounts">
              {accounts.map((account) => (
                <CommandItem
                  active={selectedValue === account.email}
                  key={account.email}
                  value={account.email}
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
                  <div className="flex items-center gap-2">
                    {account.email === activeAccount && (
                      <CheckIcon size={14} className="text-radius-accent" />
                    )}
                    <CommandShortcut className="inline-flex h-5 items-center rounded border border-radius-border-subtle bg-radius-bg-secondary px-1.5 text-[10px] font-medium text-radius-text-muted duration-150 font-[family-name:var(--font-family-sans)]">
                      D
                    </CommandShortcut>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem
                active={selectedValue === "add-account"}
                value="add-account"
                onSelect={onAddAccount}
              >
                <PlusIcon />
                <span>Add Account</span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : (
          <CommandGroup heading="Available themes">
            {themes.map((item) => (
              <CommandItem
                active={selectedValue === item.name}
                key={item.id}
                value={item.name}
                onSelect={() => {
                  if (item.id !== theme) {
                    setTheme(item.id);
                  }
                }}
                className="justify-between"
              >
                <div className="flex items-center gap-2">
                  <SunDimIcon />
                  <span className="text-sm">{item.name}</span>
                </div>
                {item.id === theme && (
                  <CheckIcon size={14} className="text-radius-accent" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
