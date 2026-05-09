import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { useTheme } from "./theme-provider";
import {
  ArrowLeftIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { Account } from "@/mainview/hooks/useInbox";
import { Home } from "./home";
import { Accounts } from "./accounts";
import { Themes } from "./themes";
import { Mailboxes } from "./mailboxes";

type Page = "home" | "accounts" | "themes" | "mailboxes";

interface CommandKProps {
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
  onAbout: () => void;
  onShowMailbox: (mailbox: "sent" | "drafts" | "trash") => void;
  onShowInbox: () => void;
  accounts: Account[];
  activeAccount: string | null;
}

export function CommandK({
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  onAbout,
  onShowMailbox,
  onShowInbox,
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

    if (page === "mailboxes") {
      setSelectedValue((current) => current || "sent");
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
            {page === "accounts"
              ? "Accounts"
              : page === "mailboxes"
                ? "Mailroom"
                : "Themes"}
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
          <Home
            selectedValue={selectedValue}
            onSelectTheme={() => {
              setPage("themes");
              setSearch("");
            }}
            onOpenMailroom={() => {
              setPage("mailboxes");
              setSearch("");
            }}
            onSearchEmails={onSearchEmails}
            onComposeEmail={onComposeEmail}
            onCheckForUpdates={onCheckForUpdates}
            onSelectAccounts={() => setPage("accounts")}
            onAbout={onAbout}
            onShowInbox={onShowInbox}
          />
        ) : page === "accounts" ? (
          <Accounts
            selectedValue={selectedValue}
            accounts={accounts}
            activeAccount={activeAccount}
            deleteTarget={deleteTarget}
            onSwitchAccount={onSwitchAccount}
            onAddAccount={onAddAccount}
          />
        ) : page === "mailboxes" ? (
          <Mailboxes
            selectedValue={selectedValue}
            onSelectMailbox={onShowMailbox}
          />
        ) : (
          <Themes
            selectedValue={selectedValue}
            themes={themes}
            currentTheme={theme}
            onSetTheme={setTheme}
          />
        )}
      </CommandList>
    </Command>
  );
}
