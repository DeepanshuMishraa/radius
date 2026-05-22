import * as React from "react";
import { useTheme } from "./theme-provider";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  UserCircleIcon,
  Settings01Icon,
  Sun01Icon,
  Add01Icon,
  Tick01Icon,
  Delete01Icon,
  Moon01Icon,
  SolarSystem01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isFontInstalled, applyUISettings } from "@/lib/font-utils";
import type { Account } from "@/mainview/hooks/useInbox";

type SettingsPage = "home" | "accounts" | "appearance" | "typography";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  activeAccount: string | null;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
  onAbout?: () => void;
}

// ─── Typography Panel ──────────────────────────────────────────

function TypographyPanel() {
  const [uiFont, setUiFont] = React.useState(() => localStorage.getItem("radius.ui.font") || "");
  const [readerFont, setReaderFont] = React.useState(() => localStorage.getItem("radius.reader.font") || "");
  const [fontSize, setFontSize] = React.useState<number>(() => {
    const saved = localStorage.getItem("radius.app.fontsize");
    return saved ? parseInt(saved, 10) : 14;
  });
  const [uiFontValid, setUiFontValid] = React.useState(true);
  const [readerFontValid, setReaderFontValid] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!uiFont.trim()) {
        setUiFontValid(true);
        localStorage.setItem("radius.ui.font", "");
        applyUISettings({ uiFont: "JetBrains Mono" });
        return;
      }
      const installed = isFontInstalled(uiFont);
      setUiFontValid(installed);
      if (installed) {
        localStorage.setItem("radius.ui.font", uiFont.trim());
        applyUISettings({ uiFont: uiFont.trim() });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [uiFont]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!readerFont.trim()) {
        setReaderFontValid(true);
        localStorage.setItem("radius.reader.font", "");
        applyUISettings({ readerFont: "" });
        return;
      }
      const installed = isFontInstalled(readerFont);
      setReaderFontValid(installed);
      if (installed) {
        localStorage.setItem("radius.reader.font", readerFont.trim());
        applyUISettings({ readerFont: readerFont.trim() });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [readerFont]);

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    localStorage.setItem("radius.app.fontsize", size.toString());
    applyUISettings({ fontSize: size });
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-4 select-none">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[12.5px] font-semibold text-radius-text-primary flex items-center gap-1.5">
            <HugeiconsIcon icon={Settings01Icon} size={14} className="text-radius-text-muted" />
            UI Font Family
          </label>
          {uiFont.trim() && (
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm transition-all duration-150",
              uiFontValid
                ? "bg-radius-success/10 text-radius-success border border-radius-success/20"
                : "bg-radius-error/10 text-radius-error border border-radius-error/20"
            )}>
              <HugeiconsIcon icon={uiFontValid ? CheckmarkCircle01Icon : Cancel01Icon} size={11} />
              {uiFontValid ? "Active" : "Not Installed"}
            </span>
          )}
        </div>
        <Input
          type="text"
          value={uiFont}
          onChange={(e) => setUiFont(e.target.value)}
          placeholder="e.g. JetBrains Mono, SF Pro, Inter"
          className={cn(
            "w-full bg-radius-bg-secondary/50 text-radius-text-primary placeholder:text-radius-text-muted/60 focus:outline-none transition-all duration-200 shadow-sm border px-3 py-2 text-[13px] rounded-lg h-9 focus-visible:ring-1 focus-visible:ring-offset-0",
            uiFont.trim() && !uiFontValid
              ? "border-radius-error/50 focus-visible:border-radius-error focus-visible:ring-radius-error"
              : "border-radius-border-subtle focus-visible:border-radius-accent focus-visible:ring-radius-accent"
          )}
        />
        {uiFont.trim() && !uiFontValid ? (
          <p className="text-[11px] text-radius-error leading-relaxed flex items-center gap-1 mt-0.5">
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
            Font not detected on system. Falling back to default monospace.
          </p>
        ) : uiFont.trim() && uiFontValid ? (
          <div className="mt-1 p-2 rounded bg-radius-bg-secondary/40 border border-radius-border-subtle/40">
            <p className="text-[10px] text-radius-text-muted uppercase tracking-wider mb-0.5">Preview</p>
            <p className="text-[13px] text-radius-text-primary truncate" style={{ fontFamily: uiFont }}>
              The quick brown fox jumps over the lazy dog. 1234567890
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-radius-text-muted leading-relaxed">
            Default UI Font is JetBrains Mono. Enter any installed local system font.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[12.5px] font-semibold text-radius-text-primary flex items-center gap-1.5">
            <HugeiconsIcon icon={Settings01Icon} size={14} className="text-radius-text-muted" />
            Reader View Font Family
          </label>
          {readerFont.trim() && (
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm transition-all duration-150",
              readerFontValid
                ? "bg-radius-success/10 text-radius-success border border-radius-success/20"
                : "bg-radius-error/10 text-radius-error border border-radius-error/20"
            )}>
              <HugeiconsIcon icon={readerFontValid ? CheckmarkCircle01Icon : Cancel01Icon} size={11} />
              {readerFontValid ? "Active" : "Not Installed"}
            </span>
          )}
        </div>
        <Input
          type="text"
          value={readerFont}
          onChange={(e) => setReaderFont(e.target.value)}
          placeholder="e.g. Georgia, SF Pro Text, Times New Roman"
          className={cn(
            "w-full bg-radius-bg-secondary/50 text-radius-text-primary placeholder:text-radius-text-muted/60 focus:outline-none transition-all duration-200 shadow-sm border px-3 py-2 text-[13px] rounded-lg h-9 focus-visible:ring-1 focus-visible:ring-offset-0",
            readerFont.trim() && !readerFontValid
              ? "border-radius-error/50 focus-visible:border-radius-error focus-visible:ring-radius-error"
              : "border-radius-border-subtle focus-visible:border-radius-accent focus-visible:ring-radius-accent"
          )}
        />
        {readerFont.trim() && !readerFontValid ? (
          <p className="text-[11px] text-radius-error leading-relaxed flex items-center gap-1 mt-0.5">
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
            Font not detected on system. Falling back to primary UI font.
          </p>
        ) : readerFont.trim() && readerFontValid ? (
          <div className="mt-1 p-2 rounded bg-radius-bg-secondary/40 border border-radius-border-subtle/40">
            <p className="text-[10px] text-radius-text-muted uppercase tracking-wider mb-0.5">Preview</p>
            <p className="text-[13px] text-radius-text-primary truncate" style={{ fontFamily: readerFont }}>
              The quick brown fox jumps over the lazy dog. 1234567890
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-radius-text-muted leading-relaxed">
            Reader view fallback is the default UI Font. Adjusts email bodies and snippets.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[12.5px] font-semibold text-radius-text-primary flex items-center gap-1.5">
          <HugeiconsIcon icon={Settings01Icon} size={14} className="text-radius-text-muted" />
          UI Sizing Scale
        </label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {[12, 13, 14, 15, 16, 17, 18].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => handleFontSizeChange(size)}
              className={cn(
                "px-3 py-1.5 text-[12px] rounded-md border transition-all duration-150 cursor-pointer shadow-sm font-semibold inline-flex items-center justify-center min-w-[52px]",
                fontSize === size
                  ? "bg-radius-accent text-white border-radius-accent shadow-[0_2px_4px_rgba(196,120,90,0.3)] hover:opacity-90"
                  : "bg-radius-bg-secondary/50 border-radius-border-subtle text-radius-text-secondary hover:bg-radius-bg-secondary hover:text-radius-text-primary hover:border-radius-border"
              )}
            >
              {size}px {size === 14 && <span className="text-[9px] opacity-75 ml-1 font-normal">(Default)</span>}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-radius-text-muted leading-relaxed mt-1">
          Scales fonts, spacing, icons, and borders dynamically across the entire workspace.
        </p>
      </div>
    </div>
  );
}

// ─── Settings Dialog Shell ───────────────────────────────────────

const PAGE_TITLES: Record<SettingsPage, string> = {
  home: "Settings",
  accounts: "Accounts",
  appearance: "Appearance",
  typography: "Typography",
};

export function SettingsDialog({
  open,
  onClose,
  accounts,
  activeAccount,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  onAbout,
}: SettingsDialogProps) {
  const [page, setPage] = React.useState<SettingsPage>("home");
  const [search, setSearch] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const { theme, themes, setTheme } = useTheme();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset when opened
  React.useEffect(() => {
    if (open) {
      setPage("home");
      setSearch("");
      setDeleteTarget(null);
    }
  }, [open]);

  // Focus input on page change
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [page, open]);

  // Escape handling — cmdk doesn't handle "back to parent page" for us
  React.useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (deleteTarget) {
          setDeleteTarget(null);
          return;
        }
        if (page !== "home") {
          setPage("home");
          setSearch("");
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleEscape, { capture: true });
    return () => document.removeEventListener("keydown", handleEscape, { capture: true });
  }, [open, page, onClose, deleteTarget]);

  const handleBack = React.useCallback(() => {
    if (deleteTarget) {
      setDeleteTarget(null);
      return;
    }
    setPage("home");
    setSearch("");
  }, [deleteTarget]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div
        className="mx-auto flex flex-col rounded-[1.25rem] border border-radius-border-subtle bg-radius-bg-primary/60 p-1 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] w-full max-w-[560px]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="w-full rounded-xl border border-radius-border-subtle overflow-hidden bg-radius-bg-primary font-[family-name:var(--font-family-sans)] antialiased shadow-sm"
          onKeyDown={(e) => {
            // Let cmdk handle arrow keys / enter; we only hijack Escape here
            if (e.key === "Escape") {
              e.preventDefault();
            }
          }}
        >
          {/* Header */}
          {page !== "home" && (
            <div className="flex items-center gap-2 px-4 py-3 border-b border-radius-border-subtle">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary hover:shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40"
                aria-label="Back"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
              </button>
              <span className="text-[13px] font-medium text-radius-text-primary">
                {PAGE_TITLES[page]}
              </span>
            </div>
          )}

          {/* Search input (hidden on sub-pages so cmdk still works) */}
          <div className={cn(
            page !== "home" ? "sr-only" : "bg-transparent",
            "border-b border-radius-border-subtle"
          )}>
            <CommandInput
              ref={inputRef}
              placeholder={page === "home" ? "Search settings..." : ""}
              autoFocus
              value={search}
              onValueChange={setSearch}
            />
          </div>

          <CommandList className="max-h-[60vh]">
            {/* Delete confirmation */}
            {page === "accounts" && deleteTarget && (
              <div className="mx-3 mt-3 mb-1 rounded-lg border border-radius-error/30 bg-radius-error/5 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={Delete01Icon} size={16} className="text-radius-error shrink-0" />
                  <p className="text-[13px] font-semibold text-radius-text-primary">Delete account?</p>
                </div>
                <p className="mt-1 truncate text-[12px] text-radius-text-secondary">{deleteTarget}</p>
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
                    onClick={() => {
                      onRemoveAccount(deleteTarget);
                      setDeleteTarget(null);
                    }}
                    className="inline-flex items-center rounded-md bg-radius-error px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:opacity-90 shadow-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {page === "home" && <CommandEmpty className="py-12 text-center text-[13px] text-radius-text-muted">No results found.</CommandEmpty>}

            {/* ─── HOME ─── */}
            {page === "home" && (
              <>
                <CommandGroup heading="Settings">
                  <CommandItem
                    value="accounts"
                    onSelect={() => { setPage("accounts"); setSearch(""); }}
                  >
                    <HugeiconsIcon icon={UserCircleIcon} size={16} className="text-radius-text-muted" />
                    <span>Accounts</span>
                  </CommandItem>
                  <CommandItem
                    value="appearance"
                    onSelect={() => { setPage("appearance"); setSearch(""); }}
                  >
                    <HugeiconsIcon icon={Sun01Icon} size={16} className="text-radius-text-muted" />
                    <span>Appearance</span>
                  </CommandItem>
                  <CommandItem
                    value="typography"
                    onSelect={() => { setPage("typography"); setSearch(""); }}
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={16} className="text-radius-text-muted" />
                    <span>Typography</span>
                  </CommandItem>
                </CommandGroup>
                {onAbout && (
                  <CommandGroup heading="Info">
                    <CommandItem
                      value="about"
                      onSelect={() => { onAbout(); }}
                    >
                      <HugeiconsIcon icon={InformationCircleIcon} size={16} className="text-radius-text-muted" />
                      <span>About</span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}

            {/* ─── ACCOUNTS ─── */}
            {page === "accounts" && !deleteTarget && (
              <>
                <CommandGroup heading="Your accounts">
                  {accounts.map((account) => (
                    <CommandItem
                      key={account.email}
                      value={account.email}
                      onSelect={() => {
                        if (account.email !== activeAccount) onSwitchAccount(account.email);
                      }}
                      data-checked={account.email === activeAccount}
                    >
                      <HugeiconsIcon icon={UserCircleIcon} size={16} className="text-radius-text-muted" />
                      <span>{account.email}</span>
                      {account.email === activeAccount && (
                        <HugeiconsIcon icon={Tick01Icon} size={14} className="ml-auto text-radius-accent" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Actions">
                  <CommandItem
                    value="add-account"
                    onSelect={onAddAccount}
                  >
                    <HugeiconsIcon icon={Add01Icon} size={16} className="text-radius-accent" />
                    <span>Add Account</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {/* ─── APPEARANCE ─── */}
            {page === "appearance" && (
              <CommandGroup heading="Available themes">
                {themes.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name}
                    onSelect={() => {
                      if (item.id !== theme) setTheme(item.id);
                    }}
                    data-checked={item.id === theme}
                  >
                    <HugeiconsIcon
                      icon={item.id === "dark" ? Moon01Icon : item.id === "light" ? Sun01Icon : SolarSystem01Icon}
                      size={16}
                      className="text-radius-text-muted"
                    />
                    <span>{item.name}</span>
                    {item.id === theme && (
                      <HugeiconsIcon icon={Tick01Icon} size={14} className="ml-auto text-radius-accent" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* ─── TYPOGRAPHY ─── */}
            {page === "typography" && (
              <div className="p-1">
                <TypographyPanel />
              </div>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
