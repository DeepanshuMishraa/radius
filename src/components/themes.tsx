import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { Sun01Icon, Moon01Icon, SolarSystem01Icon, Tick01Icon } from "@hugeicons/core-free-icons";

interface ThemeItem {
  id: string;
  name: string;
  appearance?: "light" | "dark";
  variables?: Record<string, string>;
}

interface ThemesProps {
  themes: ThemeItem[];
  currentTheme: string;
  onSetTheme: (id: string) => void;
}

export function Themes({
  themes,
  currentTheme,
  onSetTheme,
}: ThemesProps) {
  return (
    <CommandGroup heading="Available themes">
      {themes.map((item) => (
        <CommandItem
          key={item.id}
          value={item.name}
          onSelect={() => {
            if (item.id !== currentTheme) {
              onSetTheme(item.id);
            }
          }}
          className="justify-between"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={item.id === "dark" ? Moon01Icon : item.id === "light" ? Sun01Icon : SolarSystem01Icon} size={16} />
            <div className="min-w-0">
              <span className="block text-sm">{item.name}</span>
              <div className="mt-1 flex items-center gap-1.5">
                {[
                  item.variables?.["--radius-bg-primary"],
                  item.variables?.["--radius-bg-secondary"],
                  item.variables?.["--radius-accent"],
                  item.variables?.["--radius-text-primary"],
                ].map((color, index) => (
                  <span
                    key={`${item.id}-${index}`}
                    className="inline-flex h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                ))}
                <span className="text-[10px] uppercase tracking-[0.14em] text-radius-text-muted">
                  {item.appearance}
                </span>
              </div>
            </div>
          </div>
          {item.id === currentTheme && (
            <HugeiconsIcon icon={Tick01Icon} size={14} className="text-radius-accent" />
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
