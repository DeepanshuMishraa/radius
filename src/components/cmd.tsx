import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Home } from "./home";
import { Mailboxes } from "./mailboxes";
import { cn } from "@/lib/utils";

type Page = "home" | "mailboxes";

interface CommandKProps {
  onSearchEmails: () => void;
  onComposeEmail: () => void;
  onCheckForUpdates: () => void;
  onShowMailbox: (mailbox: "sent" | "drafts" | "trash") => void;
  onShowInbox: () => void;
  onClose: () => void;
  onResync: () => void;
  onReconnect: () => void;
  onOpenSettings: () => void;
}

export function CommandK({
  onSearchEmails,
  onComposeEmail,
  onCheckForUpdates,
  onShowMailbox,
  onShowInbox,
  onClose,
  onResync,
  onReconnect,
  onOpenSettings,
}: CommandKProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [page, setPage] = React.useState<Page>("home");
  const [search, setSearch] = React.useState("");

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
        if (page !== "home") {
          e.preventDefault();
          e.stopPropagation();
          setPage("home");
          setSearch("");
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleNativeEscape, { capture: true });
    return () => document.removeEventListener("keydown", handleNativeEscape, { capture: true });
  }, [page, onClose]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (page !== "home") {
          e.preventDefault();
          e.stopPropagation();
          setPage("home");
          setSearch("");
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
          return;
        }
        e.preventDefault();
        inputRef.current?.select();
      }
    },
    [page, onClose]
  );

  const handleBack = React.useCallback(() => {
    setPage("home");
    setSearch("");
  }, []);

  return (
    <div
      className={cn(
        "mx-auto flex flex-col rounded-[1.25rem] border border-radius-border-subtle bg-radius-bg-primary/40 p-1 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] w-full max-w-[720px]"
      )}
    >
      <Command
        className="w-full rounded-xl border border-radius-border-subtle overflow-hidden bg-radius-bg-primary font-[family-name:var(--font-family-sans)] antialiased shadow-sm"
        onKeyDownCapture={handleKeyDown}
      >
        {page !== "home" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-transparent border-b border-radius-border-subtle">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary hover:shadow-sm"
              aria-label="Back"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            </button>
            <span className="text-[13px] font-medium text-radius-text-primary">Mailroom</span>
          </div>
        )}

        <div className={cn(page !== "home" ? "sr-only" : "bg-transparent", "border-b border-radius-border-subtle")}>
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
              {page === "home" && (
                <CommandEmpty className="py-12 text-center text-[13px] text-radius-text-muted">
                  No results found.
                </CommandEmpty>
              )}

              <div className="p-1.5">
                {page === "home" ? (
                  <Home
                    onOpenMailroom={() => {
                      setPage("mailboxes");
                      setSearch("");
                    }}
                    onSearchEmails={onSearchEmails}
                    onComposeEmail={onComposeEmail}
                    onCheckForUpdates={onCheckForUpdates}
                    onOpenSettings={onOpenSettings}
                    onShowInbox={onShowInbox}
                    onResync={onResync}
                    onReconnect={onReconnect}
                  />
                ) : (
                  <Mailboxes onSelectMailbox={onShowMailbox} />
                )}
              </div>
            </CommandList>
          </div>
        </div>
      </Command>
    </div>
  );
}
