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

// ─── Accounts Panel ──────────────────────────────────────────────

function AccountsPanel({
  accounts,
  activeAccount,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
}: {
  accounts: Account[];
  activeAccount: string | null;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      {deleteTarget && (
        <div className="mx-2 rounded-lg border border-radius-error/30 bg-radius-error/5 p-4 shadow-sm">
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

      <div className="flex flex-col gap-0.5">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-radius-text-muted mb-1">Your accounts</p>
        {accounts.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => {
              if (account.email !== activeAccount) onSwitchAccount(account.email);
            }}
            disabled={!!deleteTarget}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40",
              account.email === activeAccount
                ? "bg-radius-accent/10 text-radius-accent"
                : "hover:bg-radius-bg-secondary text-radius-text-primary"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <HugeiconsIcon icon={UserCircleIcon} size={18} className={cn(
                "shrink-0",
                account.email === activeAccount ? "text-radius-accent" : "text-radius-text-muted"
              )} />
              <span className="text-[13px] font-medium truncate">{account.email}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {account.email === activeAccount && (
                <HugeiconsIcon icon={Tick01Icon} size={14} className="text-radius-accent" />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(account.email);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted opacity-0 transition-opacity hover:bg-radius-error/10 hover:text-radius-error group-hover:opacity-100"
                style={{ opacity: deleteTarget ? 0 : undefined }}
                title="Remove account"
              >
                <HugeiconsIcon icon={Delete01Icon} size={13} />
              </button>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddAccount}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-radius-bg-secondary text-radius-text-primary outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40"
      >
        <HugeiconsIcon icon={Add01Icon} size={18} className="text-radius-accent" />
        <span className="text-[13px] font-medium">Add Account</span>
      </button>
    </div>
  );
}

// ─── Appearance Panel ────────────────────────────────────────────

interface ThemeItem {
  id: string;
  name: string;
}

function AppearancePanel({
  themes,
  currentTheme,
  onSetTheme,
}: {
  themes: ThemeItem[];
  currentTheme: string;
  onSetTheme: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-radius-text-muted mb-1">Available themes</p>
      {themes.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            if (item.id !== currentTheme) onSetTheme(item.id);
          }}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40",
            item.id === currentTheme
              ? "bg-radius-accent/10 text-radius-accent"
              : "hover:bg-radius-bg-secondary text-radius-text-primary"
          )}
        >
          <div className="flex items-center gap-2.5">
            <HugeiconsIcon
              icon={item.id === "dark" ? Moon01Icon : item.id === "light" ? Sun01Icon : SolarSystem01Icon}
              size={18}
              className={item.id === currentTheme ? "text-radius-accent" : "text-radius-text-muted"}
            />
            <span className="text-[13px] font-medium">{item.name}</span>
          </div>
          {item.id === currentTheme && <HugeiconsIcon icon={Tick01Icon} size={14} className="text-radius-accent" />}
        </button>
      ))}
    </div>
  );
}

// ─── Home Panel (Categories) ─────────────────────────────────────

function HomePanel({
  onNavigate,
  onAbout,
}: {
  onNavigate: (page: SettingsPage) => void;
  onAbout?: () => void;
}) {
  const categories: { id: SettingsPage | "about"; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: "accounts",
      label: "Accounts",
      desc: "Switch, add, or remove email accounts",
      icon: <HugeiconsIcon icon={UserCircleIcon} size={18} className="text-radius-text-muted" />,
    },
    {
      id: "appearance",
      label: "Appearance",
      desc: "Light, dark, and system theme modes",
      icon: <HugeiconsIcon icon={Sun01Icon} size={18} className="text-radius-text-muted" />,
    },
    {
      id: "typography",
      label: "Typography",
      desc: "Fonts, sizing, and reader view preferences",
      icon: <HugeiconsIcon icon={Settings01Icon} size={18} className="text-radius-text-muted" />,
    },
  ];

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => {
            if (cat.id === "about") {
              onAbout?.();
            } else {
              onNavigate(cat.id as SettingsPage);
            }
          }}
          className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-radius-bg-secondary group outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-radius-bg-secondary/80 border border-radius-border-subtle/50">
            {cat.icon}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium text-radius-text-primary">{cat.label}</span>
            <span className="text-[11px] text-radius-text-muted">{cat.desc}</span>
          </div>
        </button>
      ))}
      {onAbout && (
        <button
          type="button"
          onClick={onAbout}
          className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-radius-bg-secondary group outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-radius-bg-secondary/80 border border-radius-border-subtle/50">
            <HugeiconsIcon icon={InformationCircleIcon} size={18} className="text-radius-text-muted" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium text-radius-text-primary">About</span>
            <span className="text-[11px] text-radius-text-muted">Version info and credits</span>
          </div>
        </button>
      )}
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
  const { theme, themes, setTheme } = useTheme();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pageRef = React.useRef<SettingsPage>("home");

  // Keep ref in sync for the escape handler
  React.useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // Reset to home when opened
  React.useEffect(() => {
    if (open) setPage("home");
  }, [open]);

  // Focus first item when page changes
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const container = contentRef.current;
      if (!container) return;
      const first = container.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [page, open]);

  // Keyboard navigation + escape
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = contentRef.current;
      if (!container) return;

      // ── Escape: back from submenu, close from home ──
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (pageRef.current !== "home") {
          setPage("home");
        } else {
          onClose();
        }
        return;
      }

      // ── Arrow navigation ──
      const FOCUSABLE_SELECTOR =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null
      );
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? items.indexOf(active) : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        next?.focus();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        prev?.focus();
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
        return;
      }

      if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div
        className="mx-auto flex flex-col rounded-[1.25rem] border border-radius-border-subtle bg-radius-bg-primary/60 p-1 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] w-full max-w-[560px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full rounded-xl border border-radius-border-subtle overflow-hidden bg-radius-bg-primary font-[family-name:var(--font-family-sans)] antialiased shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-radius-border-subtle">
            {page !== "home" && (
              <button
                type="button"
                onClick={() => setPage("home")}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary hover:shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-radius-accent/40"
                aria-label="Back"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
              </button>
            )}
            <span className="text-[13px] font-medium text-radius-text-primary">{PAGE_TITLES[page]}</span>
          </div>

          {/* Content */}
          <div ref={contentRef} className="max-h-[60vh] overflow-y-auto">
            {page === "home" && <HomePanel onNavigate={setPage} onAbout={onAbout} />}
            {page === "accounts" && (
              <AccountsPanel
                accounts={accounts}
                activeAccount={activeAccount}
                onSwitchAccount={onSwitchAccount}
                onAddAccount={onAddAccount}
                onRemoveAccount={onRemoveAccount}
              />
            )}
            {page === "appearance" && (
              <AppearancePanel
                themes={themes}
                currentTheme={theme}
                onSetTheme={setTheme}
              />
            )}
            {page === "typography" && <TypographyPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
