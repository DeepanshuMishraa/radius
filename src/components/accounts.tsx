import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import type { Account } from "@/mainview/hooks/useInbox";

interface AccountsProps {
  accounts: Account[];
  activeAccount: string | null;
  deleteTarget: string | null;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
}

export function Accounts({
  accounts,
  activeAccount,
  deleteTarget,
  onSwitchAccount,
  onAddAccount,
}: AccountsProps) {
  return (
    <>
      <CommandGroup heading="Your accounts">
        {accounts.map((account) => (
          <CommandItem
            key={account.email}
            value={account.email}
            onSelect={() => {
              if (account.email !== activeAccount) {
                onSwitchAccount(account.email);
              }
            }}
            className="justify-between"
            disabled={!!deleteTarget}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-radius-border-subtle bg-radius-bg-secondary text-[10px] font-semibold text-radius-text-primary">
                {(account.name || account.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-radius-text-primary">
                  {account.name || account.email}
                </div>
                <div className="truncate text-[11px] text-radius-text-muted">
                  {account.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {account.email === activeAccount && (
                <HugeiconsIcon icon={Tick01Icon} size={14} className="text-radius-accent" />
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
          value="add-account"
          onSelect={onAddAccount}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} />
          <span>Add Account</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}
