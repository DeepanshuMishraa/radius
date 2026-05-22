import * as React from "react";
import { CommandGroup } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { HugeiconsIcon } from "@hugeicons/react";
import { 
  Cancel01Icon, 
  CheckmarkCircle01Icon,
  Settings01Icon
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { isFontInstalled, applyUISettings } from "@/lib/font-utils";

export function UISettings() {
  const [uiFont, setUiFont] = React.useState(() => {
    return localStorage.getItem("radius.ui.font") || "";
  });

  const [readerFont, setReaderFont] = React.useState(() => {
    return localStorage.getItem("radius.reader.font") || "";
  });

  const [fontSize, setFontSize] = React.useState<number>(() => {
    const saved = localStorage.getItem("radius.app.fontsize");
    return saved ? parseInt(saved, 10) : 14;
  });

  // Installation and validation states
  const [uiFontValid, setUiFontValid] = React.useState(true);
  const [readerFontValid, setReaderFontValid] = React.useState(true);

  // Instantly update UI Font in text box
  const handleUiFontChange = (val: string) => {
    setUiFont(val);
  };

  // Instantly update Reader Font in text box
  const handleReaderFontChange = (val: string) => {
    setReaderFont(val);
  };

  // Debounce UI Font validation and application (track when user is done typing)
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

  // Debounce Reader Font validation and application (track when user is done typing)
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

  // Instantly apply and persist Font Size on change
  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    localStorage.setItem("radius.app.fontsize", size.toString());
    applyUISettings({ fontSize: size });
  };

  return (
    <CommandGroup heading="UI & Typography Settings" className="font-[family-name:var(--font-family-sans)]">
      <div className="flex flex-col gap-6 px-4 py-4 select-none">
        
        {/* UI FONT FAMILY INPUT */}
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
            onChange={(e) => handleUiFontChange(e.target.value)}
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
              <p 
                className="text-[13px] text-radius-text-primary truncate" 
                style={{ fontFamily: uiFont }}
              >
                The quick brown fox jumps over the lazy dog. 1234567890
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-radius-text-muted leading-relaxed">
              Default UI Font is JetBrains Mono. Enter any installed local system font.
            </p>
          )}
        </div>

        {/* READER VIEW FONT FAMILY INPUT */}
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
            onChange={(e) => handleReaderFontChange(e.target.value)}
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
              <p 
                className="text-[13px] text-radius-text-primary truncate" 
                style={{ fontFamily: readerFont }}
              >
                The quick brown fox jumps over the lazy dog. 1234567890
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-radius-text-muted leading-relaxed">
              Reader view fallback is the default UI Font. Adjusts email bodies and snippets.
            </p>
          )}
        </div>

        {/* APPLICATION BASE FONT SIZE */}
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
    </CommandGroup>
  );
}
