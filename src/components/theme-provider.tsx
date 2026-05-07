import * as React from "react";
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  applyTheme,
  getThemeById,
} from "./theme-registry";
import type { AppTheme, ThemeAppearance } from "./theme-registry";

type Theme = string;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themes: typeof APP_THEMES;
  resolvedTheme: AppTheme | null;
  appearance: ThemeAppearance;
};

const initialState: ThemeProviderState = {
  theme: DEFAULT_THEME_ID,
  setTheme: () => null,
  themes: APP_THEMES,
  resolvedTheme: getThemeById(DEFAULT_THEME_ID),
  appearance: getThemeById(DEFAULT_THEME_ID)?.appearance ?? "dark",
};

const ThemeProviderContext = React.createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME_ID,
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const storageAppearanceKey = `${storageKey}-appearance`;
  const storageVariablesKey = `${storageKey}-vars`;
  const [theme, setTheme] = React.useState<Theme>(
    () => localStorage.getItem(storageKey) || defaultTheme
  );

  React.useEffect(() => {
    const root = window.document.documentElement;
    const resolvedTheme = applyTheme(theme, root);
    const fallbackAppearance = theme === "light" ? "light" : "dark";

    localStorage.setItem(storageKey, theme);

    if (!resolvedTheme) {
      localStorage.removeItem(storageVariablesKey);
      localStorage.setItem(storageAppearanceKey, fallbackAppearance);
      return;
    }

    localStorage.setItem(storageAppearanceKey, resolvedTheme.appearance);
    localStorage.setItem(storageVariablesKey, JSON.stringify(resolvedTheme.variables));
  }, [storageAppearanceKey, storageKey, storageVariablesKey, theme]);

  React.useEffect(() => {
    if (getThemeById(theme)) {
      return;
    }

    setTheme(defaultTheme);
  }, [defaultTheme, theme]);

  const value = {
    theme,
    setTheme: (nextTheme: Theme) => {
      setTheme(nextTheme);
    },
    themes: APP_THEMES,
    resolvedTheme: getThemeById(theme),
    appearance: getThemeById(theme)?.appearance ?? "dark",
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
