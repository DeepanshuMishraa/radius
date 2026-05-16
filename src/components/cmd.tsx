import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { useTheme } from "./theme-provider";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { Account } from "@/mainview/hooks/useInbox";
import { Home } from "./home";
import { Accounts } from "./accounts";
import { Themes } from "./themes";
import { Mailboxes } from "./mailboxes";
import { cn } from "@/lib/utils";

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
  onEmptyTrash: () => void;
  onShowInbox: () => void;
  onClose: () => void;
  onResync: () => void;
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
  onEmptyTrash,
  onShowInbox,
  onClose,
  onResync,
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
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [page]);

  // Handle Escape: go back from submenus, close dialog from home
  React.useEffect(() => {
    const handleNativeEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteTarget) {
          e.preventDefault();
          e.stopPropagation();
          setDeleteTarget(null);
          return;
        }
        if (page !== "home") {
          e.preventDefault();
          e.stopPropagation();
          setPage("home");
          setSearch("");
          return;
        }
        // On home page, close the dialog
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleNativeEscape, { capture: true });
    return () => document.removeEventListener("keydown", handleNativeEscape, { capture: true });
  }, [page, deleteTarget, onClose]);

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
    },
    []
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
    <div 
      className={cn(
        "mx-auto flex flex-col rounded-[1.25rem] border border-radius-border-subtle bg-radius-bg-primary/40 p-1 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] w-full max-w-[720px]"
      )}
    >
      <Command
        onValueChange={setSelectedValue}
        className="w-full rounded-xl border border-radius-border-subtle overflow-hidden bg-radius-bg-primary font-[family-name:var(--font-family-sans)] antialiased shadow-sm"
        onKeyDownCapture={handleKeyDown}
      >
      {page !== "home" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-transparent">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary hover:shadow-sm"
            aria-label="Back"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          </button>
          <span className="text-[13px] font-medium text-radius-text-primary">
            {page === "accounts"
              ? "Accounts"
              : page === "mailboxes"
                ? "Mailroom"
                : "Themes"}
          </span>
        </div>
      )}
      
      {deleteTarget && (
        <div className="mx-4 mt-4 mb-2 rounded-lg border border-radius-error/30 bg-radius-error/5 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Delete01Icon} size={16} className="text-radius-error shrink-0" />
            <p className="text-[13px] font-semibold text-radius-text-primary">
              Delete account?
            </p>
          </div>
          <p className="mt-1 truncate text-[12px] text-radius-text-secondary">
            {deleteTarget}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="inline-flex items-center rounded-md border border-radius-border-subtle bg-radius-bg-primary px-3 py-1.5 text-[12px] font-medium text-radius-text-secondary transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary shadow-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="inline-flex items-center rounded-md bg-radius-error px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:opacity-90 shadow-sm"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className={cn(
        page !== "home" ? "sr-only" : "bg-transparent",
        "border-b border-radius-border-subtle"
      )}>
        <CommandInput
          ref={inputRef}
          placeholder={page === "home" ? "Type a command or search..." : ""}
          autoFocus
          value={search}
          onValueChange={setSearch}
        />
      </div>

      <div className="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <div className="overflow-hidden">
          <CommandList className="max-h-[60vh]">
            <CommandEmpty className="py-12 text-center text-[13px] text-radius-text-muted">
              No results found.
            </CommandEmpty>
            
            <div className="p-1.5">
              {page === "home" ? (
                <Home
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
                  onResync={onResync}
                />
              ) : page === "accounts" ? (
                <Accounts
                  accounts={accounts}
                  activeAccount={activeAccount}
                  deleteTarget={deleteTarget}
                  onSwitchAccount={onSwitchAccount}
                  onAddAccount={onAddAccount}
                />
              ) : page === "mailboxes" ? (
                <Mailboxes
                  onSelectMailbox={onShowMailbox}
                  onEmptyTrash={onEmptyTrash}
                />
              ) : (
                <Themes
                  themes={themes}
                  currentTheme={theme}
                  onSetTheme={setTheme}
                />
              )}
            </div>
          </CommandList>
        </div>
      </div>
    </Command>
    </div>
  );
}
