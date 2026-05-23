import * as React from "react";
import { useTheme } from "./theme-provider";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  UserCircleIcon,
  Mail01Icon,
  Settings01Icon,
  Sun01Icon,
  Add01Icon,
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

interface TypographyState {
  uiFont: string;
  readerFont: string;
  fontSize: number;
  uiFontValid: boolean;
  readerFontValid: boolean;
}

type TypographyAction =
  | { type: "setUiFont"; value: string }
  | { type: "setReaderFont"; value: string }
  | { type: "setFontSize"; value: number }
  | { type: "setUiFontValid"; value: boolean }
  | { type: "setReaderFontValid"; value: boolean };

function getInitialTypographyState(): TypographyState {
  const savedFontSize = localStorage.getItem("radius.app.fontsize");

  return {
    uiFont: localStorage.getItem("radius.ui.font") || "",
    readerFont: localStorage.getItem("radius.reader.font") || "",
    fontSize: savedFontSize ? parseInt(savedFontSize, 10) : 14,
    uiFontValid: true,
    readerFontValid: true,
  };
}

function typographyReducer(state: TypographyState, action: TypographyAction): TypographyState {
  switch (action.type) {
    case "setUiFont":
      return { ...state, uiFont: action.value };
    case "setReaderFont":
      return { ...state, readerFont: action.value };
    case "setFontSize":
      return { ...state, fontSize: action.value };
    case "setUiFontValid":
      return { ...state, uiFontValid: action.value };
    case "setReaderFontValid":
      return { ...state, readerFontValid: action.value };
    default:
      return state;
  }
}

interface SettingsDialogState {
  page: SettingsPage;
  search: string;
  deleteTarget: string | null;
}

type SettingsDialogAction =
  | { type: "reset" }
  | { type: "setPage"; value: SettingsPage }
  | { type: "setSearch"; value: string }
  | { type: "setDeleteTarget"; value: string | null }
  | { type: "goHome" };

function settingsDialogReducer(
  state: SettingsDialogState,
  action: SettingsDialogAction
): SettingsDialogState {
  switch (action.type) {
    case "reset":
      return { page: "home", search: "", deleteTarget: null };
    case "setPage":
      return { ...state, page: action.value, search: "" };
    case "setSearch":
      return { ...state, search: action.value };
    case "setDeleteTarget":
      return { ...state, deleteTarget: action.value };
    case "goHome":
      return { page: "home", search: "", deleteTarget: null };
    default:
      return state;
  }
}

// ─── Typography Panel ──────────────────────────────────────────

function TypographyPanel() {
  const [state, dispatch] = React.useReducer(
    typographyReducer,
    undefined,
    getInitialTypographyState
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!state.uiFont.trim()) {
        dispatch({ type: "setUiFontValid", value: true });
        localStorage.setItem("radius.ui.font", "");
        applyUISettings({ uiFont: "JetBrains Mono" });
        return;
      }

      const installed = isFontInstalled(state.uiFont);
      dispatch({ type: "setUiFontValid", value: installed });
      if (installed) {
        localStorage.setItem("radius.ui.font", state.uiFont.trim());
        applyUISettings({ uiFont: state.uiFont.trim() });
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [state.uiFont]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!state.readerFont.trim()) {
        dispatch({ type: "setReaderFontValid", value: true });
        localStorage.setItem("radius.reader.font", "");
        applyUISettings({ readerFont: "" });
        return;
      }

      const installed = isFontInstalled(state.readerFont);
      dispatch({ type: "setReaderFontValid", value: installed });
      if (installed) {
        localStorage.setItem("radius.reader.font", state.readerFont.trim());
        applyUISettings({ readerFont: state.readerFont.trim() });
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [state.readerFont]);

  const handleFontSizeChange = (size: number) => {
    dispatch({ type: "setFontSize", value: size });
    localStorage.setItem("radius.app.fontsize", size.toString());
    applyUISettings({ fontSize: size });
  };

  return (
    <div className="flex flex-col gap-6 p-4 select-none">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="settings-ui-font"
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-radius-text-primary"
          >
            <HugeiconsIcon icon={Settings01Icon} size={14} className="text-radius-text-muted" />
            UI Font Family
          </label>
          {state.uiFont.trim() && (
            <span
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-all duration-150",
                state.uiFontValid
                  ? "border border-radius-success/20 bg-radius-success/10 text-radius-success"
                  : "border border-radius-error/20 bg-radius-error/10 text-radius-error"
              )}
            >
              <HugeiconsIcon
                icon={state.uiFontValid ? CheckmarkCircle01Icon : Cancel01Icon}
                size={11}
              />
              {state.uiFontValid ? "Active" : "Not Installed"}
            </span>
          )}
        </div>
        <Input
          id="settings-ui-font"
          type="text"
          value={state.uiFont}
          onChange={(e) => dispatch({ type: "setUiFont", value: e.target.value })}
          placeholder="e.g. JetBrains Mono, SF Pro, Inter"
          className={cn(
            "h-9 w-full rounded-lg border bg-radius-bg-secondary/50 px-3 py-2 text-[13px] text-radius-text-primary shadow-sm transition-all duration-200 placeholder:text-radius-text-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-offset-0",
            state.uiFont.trim() && !state.uiFontValid
              ? "border-radius-error/50 focus-visible:border-radius-error focus-visible:ring-radius-error"
              : "border-radius-border-subtle focus-visible:border-radius-accent focus-visible:ring-radius-accent"
          )}
        />
        {state.uiFont.trim() && !state.uiFontValid ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-relaxed text-radius-error">
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
            Font not detected on system. Falling back to default monospace.
          </p>
        ) : state.uiFont.trim() && state.uiFontValid ? (
          <div className="mt-1 rounded border border-radius-border-subtle/40 bg-radius-bg-secondary/40 p-2">
            <p className="mb-0.5 text-[10px] uppercase tracking-wider text-radius-text-muted">
              Preview
            </p>
            <p
              className="truncate text-[13px] text-radius-text-primary"
              style={{ fontFamily: state.uiFont }}
            >
              The quick brown fox jumps over the lazy dog. 1234567890
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-radius-text-muted">
            Default UI Font is JetBrains Mono. Enter any installed local system font.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="settings-reader-font"
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-radius-text-primary"
          >
            <HugeiconsIcon icon={Settings01Icon} size={14} className="text-radius-text-muted" />
            Reader View Font Family
          </label>
          {state.readerFont.trim() && (
            <span
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-all duration-150",
                state.readerFontValid
                  ? "border border-radius-success/20 bg-radius-success/10 text-radius-success"
                  : "border border-radius-error/20 bg-radius-error/10 text-radius-error"
              )}
            >
              <HugeiconsIcon
                icon={state.readerFontValid ? CheckmarkCircle01Icon : Cancel01Icon}
                size={11}
              />
              {state.readerFontValid ? "Active" : "Not Installed"}
            </span>
          )}
        </div>
        <Input
          id="settings-reader-font"
          type="text"
          value={state.readerFont}
          onChange={(e) => dispatch({ type: "setReaderFont", value: e.target.value })}
          placeholder="e.g. Georgia, SF Pro Text, Times New Roman"
          className={cn(
            "h-9 w-full rounded-lg border bg-radius-bg-secondary/50 px-3 py-2 text-[13px] text-radius-text-primary shadow-sm transition-all duration-200 placeholder:text-radius-text-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-offset-0",
            state.readerFont.trim() && !state.readerFontValid
              ? "border-radius-error/50 focus-visible:border-radius-error focus-visible:ring-radius-error"
              : "border-radius-border-subtle focus-visible:border-radius-accent focus-visible:ring-radius-accent"
          )}
        />
        {state.readerFont.trim() && !state.readerFontValid ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-relaxed text-radius-error">
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
            Font not detected on system. Falling back to primary UI font.
          </p>
        ) : state.readerFont.trim() && state.readerFontValid ? (
          <div className="mt-1 rounded border border-radius-border-subtle/40 bg-radius-bg-secondary/40 p-2">
            <p className="mb-0.5 text-[10px] uppercase tracking-wider text-radius-text-muted">
              Preview
            </p>
            <p
              className="truncate text-[13px] text-radius-text-primary"
              style={{ fontFamily: state.readerFont }}
            >
              The quick brown fox jumps over the lazy dog. 1234567890
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-radius-text-muted">
            Reader view fallback is the default UI Font. Adjusts email bodies and snippets.
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="flex items-center gap-1.5 text-[12.5px] font-semibold text-radius-text-primary">
          <HugeiconsIcon icon={Settings01Icon} size={14} className="text-radius-text-muted" />
          UI Sizing Scale
        </legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {[12, 13, 14, 15, 16, 17, 18].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => handleFontSizeChange(size)}
              aria-pressed={state.fontSize === size}
              className={cn(
                "inline-flex min-w-[52px] items-center justify-center rounded-md border px-3 py-1.5 text-[12px] font-semibold shadow-sm transition-all duration-150",
                state.fontSize === size
                  ? "border-radius-accent bg-radius-accent text-white shadow-[0_2px_4px_rgba(196,120,90,0.3)] hover:opacity-90"
                  : "border-radius-border-subtle bg-radius-bg-secondary/50 text-radius-text-secondary hover:border-radius-border hover:bg-radius-bg-secondary hover:text-radius-text-primary"
              )}
            >
              {size}px{" "}
              {size === 14 && (
                <span className="ml-1 text-[9px] font-normal opacity-75">(Default)</span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-radius-text-muted">
          Scales fonts, spacing, icons, and borders dynamically across the entire workspace.
        </p>
      </fieldset>
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
  const [state, dispatch] = React.useReducer(settingsDialogReducer, {
    page: "home",
    search: "",
    deleteTarget: null,
  });
  const { page, search, deleteTarget } = state;
  const { theme, themes, setTheme } = useTheme();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      dispatch({ type: "reset" });
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [page, open]);

  React.useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      e.preventDefault();
      e.stopPropagation();

      if (deleteTarget) {
        dispatch({ type: "setDeleteTarget", value: null });
        return;
      }

      if (page !== "home") {
        dispatch({ type: "goHome" });
        return;
      }

      onClose();
    };

    document.addEventListener("keydown", handleEscape, { capture: true });
    return () => document.removeEventListener("keydown", handleEscape, { capture: true });
  }, [deleteTarget, onClose, open, page]);

  const handleBack = React.useCallback(() => {
    if (deleteTarget) {
      dispatch({ type: "setDeleteTarget", value: null });
      return;
    }

    dispatch({ type: "goHome" });
  }, [deleteTarget]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative mx-auto flex w-full max-w-[560px] flex-col rounded-[1.25rem] border border-radius-border-subtle bg-radius-bg-primary/60 p-1 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <Command
          className="w-full overflow-hidden rounded-xl border border-radius-border-subtle bg-radius-bg-primary font-[family-name:var(--font-family-sans)] antialiased shadow-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
            }
          }}
        >
          {page !== "home" && (
            <div className="flex items-center gap-2 border-b border-radius-border-subtle px-4 py-3">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex size-6 items-center justify-center rounded-md text-radius-text-muted outline-none transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary hover:shadow-sm focus-visible:ring-2 focus-visible:ring-radius-accent/40"
                aria-label="Back"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
              </button>
              <span className="text-[13px] font-medium text-radius-text-primary">
                {PAGE_TITLES[page]}
              </span>
            </div>
          )}

          <div
            className={cn(
              "border-b border-radius-border-subtle",
              page !== "home" ? "sr-only" : "bg-transparent"
            )}
          >
            <CommandInput
              ref={inputRef}
              placeholder={page === "home" ? "Search settings..." : ""}
              value={search}
              onValueChange={(value) => dispatch({ type: "setSearch", value })}
            />
          </div>

          <CommandList className="max-h-[60vh]">
            {page === "accounts" && deleteTarget && (
              <div className="mx-3 mb-1 mt-3 rounded-lg border border-radius-error/30 bg-radius-error/5 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Delete01Icon}
                    size={16}
                    className="shrink-0 text-radius-error"
                  />
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
                    onClick={() => dispatch({ type: "setDeleteTarget", value: null })}
                    className="inline-flex items-center rounded-md border border-radius-border-subtle bg-radius-bg-primary px-3 py-1.5 text-[12px] font-medium text-radius-text-secondary shadow-sm transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveAccount(deleteTarget);
                      dispatch({ type: "setDeleteTarget", value: null });
                    }}
                    className="inline-flex items-center rounded-md bg-radius-error px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:opacity-90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {page === "home" && (
              <CommandEmpty className="py-12 text-center text-[13px] text-radius-text-muted">
                No results found.
              </CommandEmpty>
            )}

            {page === "home" && (
              <>
                <CommandGroup heading="Settings">
                  <CommandItem
                    value="accounts"
                    onSelect={() => dispatch({ type: "setPage", value: "accounts" })}
                  >
                    <HugeiconsIcon icon={UserCircleIcon} size={16} className="text-radius-text-muted" />
                    <span>Accounts</span>
                  </CommandItem>
                  <CommandItem
                    value="appearance"
                    onSelect={() => dispatch({ type: "setPage", value: "appearance" })}
                  >
                    <HugeiconsIcon icon={Sun01Icon} size={16} className="text-radius-text-muted" />
                    <span>Appearance</span>
                  </CommandItem>
                  <CommandItem
                    value="typography"
                    onSelect={() => dispatch({ type: "setPage", value: "typography" })}
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={16} className="text-radius-text-muted" />
                    <span>Typography</span>
                  </CommandItem>
                </CommandGroup>
                {onAbout && (
                  <CommandGroup heading="Info">
                    <CommandItem value="about" onSelect={() => onAbout()}>
                      <HugeiconsIcon
                        icon={InformationCircleIcon}
                        size={16}
                        className="text-radius-text-muted"
                      />
                      <span>About</span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}

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
                      <HugeiconsIcon
                        icon={account.provider === "imap" ? Mail01Icon : UserCircleIcon}
                        size={16}
                        className={account.provider === "imap" ? "text-radius-text-secondary" : "text-radius-text-muted"}
                      />
                      <span>{account.email}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${account.email}`}
                        className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-error"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({ type: "setDeleteTarget", value: account.email });
                        }}
                      >
                        <HugeiconsIcon icon={Delete01Icon} size={14} />
                      </button>

                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Actions">
                  <CommandItem value="add-account" onSelect={onAddAccount}>
                    <HugeiconsIcon icon={Add01Icon} size={16} className="text-radius-accent" />
                    <span>Add Account</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

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
                      icon={
                        item.id === "dark"
                          ? Moon01Icon
                          : item.id === "light"
                            ? Sun01Icon
                            : SolarSystem01Icon
                      }
                      size={16}
                      className="text-radius-text-muted"
                    />
                    <span>{item.name}</span>

                  </CommandItem>
                ))}
              </CommandGroup>
            )}

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
