import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { Sun01Icon, Tick01Icon } from "@hugeicons/core-free-icons";

interface ThemeItem {
  id: string;
  name: string;
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
            <HugeiconsIcon icon={Sun01Icon} size={16} />
            <span className="text-sm">{item.name}</span>
          </div>
          {item.id === currentTheme && (
            <HugeiconsIcon icon={Tick01Icon} size={14} className="text-radius-accent" />
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
