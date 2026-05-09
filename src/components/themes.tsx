import { CommandGroup, CommandItem } from "@/components/ui/command";
import { SunDimIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";

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
            <SunDimIcon />
            <span className="text-sm">{item.name}</span>
          </div>
          {item.id === currentTheme && (
            <CheckIcon size={14} className="text-radius-accent" />
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
