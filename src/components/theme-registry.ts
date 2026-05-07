type FlatThemeFile = {
  id?: string;
  name?: string;
  description?: string;
  appearance?: "light" | "dark";
  tokens?: Record<string, string>;
};

type ZedThemeVariant = {
  name?: string;
  appearance?: "light" | "dark";
  style?: Record<string, string | string[] | null>;
};

type ZedThemeFile = {
  name?: string;
  themes?: ZedThemeVariant[];
};

export type ThemeAppearance = "light" | "dark";

export type AppTheme = {
  id: string;
  name: string;
  description?: string;
  appearance: ThemeAppearance;
  variables: Record<string, string>;
};

const themeFiles = import.meta.glob("../../themes/*.json", {
  eager: true,
  import: "default",
}) as Record<string, FlatThemeFile | ZedThemeFile>;

const THEME_VAR_KEYS = [
  "--radius-frame-bg",
  "--radius-bg-primary",
  "--radius-bg-secondary",
  "--radius-bg-tertiary",
  "--radius-text-primary",
  "--radius-text-secondary",
  "--radius-text-muted",
  "--radius-text-inverse",
  "--radius-accent",
  "--radius-accent-hover",
  "--radius-accent-subtle",
  "--radius-success",
  "--radius-warning",
  "--radius-error",
  "--radius-info",
  "--radius-border-subtle",
  "--radius-border",
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
] as const;

const clampAlpha = (value: number) => Math.max(0, Math.min(1, value));

function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();

  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((part) => part + part)
            .join("")
        : hex.length === 4
          ? hex
              .split("")
              .map((part) => part + part)
              .join("")
          : hex;

    const base = expanded.slice(0, 6);
    return `#${base}${Math.round(clampAlpha(alpha) * 255)
      .toString(16)
      .padStart(2, "0")}`;
  }

  if (normalized.startsWith("rgb(")) {
    return normalized.replace("rgb(", "rgba(").replace(")", `, ${clampAlpha(alpha)})`);
  }

  if (normalized.startsWith("rgba(")) {
    const parts = normalized.slice(5, -1).split(",").map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clampAlpha(alpha)})`;
  }

  return color;
}

function normalizeFlatTheme(file: FlatThemeFile): AppTheme | null {
  if (!file.id || !file.name || !file.appearance || !file.tokens) {
    return null;
  }

  const { tokens } = file;
  const appearance = file.appearance;
  const textInverse = appearance === "dark" ? "#111111" : "#ffffff";
  const primaryForeground = appearance === "dark" ? "#111111" : "#ffffff";
  const accentSubtle =
    tokens.accentSelection ??
    withAlpha(tokens.accent, appearance === "dark" ? 0.24 : 0.14);
  const warning = appearance === "dark" ? "#d4b56e" : "#c4a35a";
  const surface = tokens.sheetBg ?? tokens.bgSidebar ?? tokens.bg;
  const elevatedSurface = tokens.bgSidebar ?? tokens.sheetBg ?? tokens.bg;
  const tertiarySurface =
    tokens.controlActive ?? tokens.controlHover ?? tokens.separator;
  const separator = tokens.separator ?? tokens.sheetBorder;
  const border = tokens.sheetBorder ?? tokens.separator;

  return {
    id: file.id,
    name: file.name,
    description: file.description,
    appearance,
    variables: {
      "--radius-frame-bg": tokens.bg,
      "--radius-bg-primary": surface,
      "--radius-bg-secondary": elevatedSurface,
      "--radius-bg-tertiary": tertiarySurface,
      "--radius-text-primary": tokens.text,
      "--radius-text-secondary": tokens.textSecondary,
      "--radius-text-muted": tokens.textTertiary,
      "--radius-text-inverse": textInverse,
      "--radius-accent": tokens.accent,
      "--radius-accent-hover": tokens.accent,
      "--radius-accent-subtle": accentSubtle,
      "--radius-success": tokens.success,
      "--radius-warning": warning,
      "--radius-error": tokens.danger,
      "--radius-info": tokens.accent,
      "--radius-border-subtle": separator,
      "--radius-border": border,
      "--background": tokens.bg,
      "--foreground": tokens.text,
      "--card": surface,
      "--card-foreground": tokens.text,
      "--popover": surface,
      "--popover-foreground": tokens.text,
      "--primary": tokens.accent,
      "--primary-foreground": primaryForeground,
      "--secondary": elevatedSurface,
      "--secondary-foreground": tokens.text,
      "--muted": tertiarySurface,
      "--muted-foreground": tokens.textSecondary,
      "--accent": tokens.controlHover ?? accentSubtle,
      "--accent-foreground": tokens.text,
      "--destructive": tokens.danger,
      "--input": border,
      "--ring": tokens.focusRing ?? tokens.accent,
      "--sidebar": elevatedSurface,
      "--sidebar-foreground": tokens.text,
      "--sidebar-primary": tokens.accent,
      "--sidebar-primary-foreground": primaryForeground,
      "--sidebar-accent": tertiarySurface,
      "--sidebar-accent-foreground": tokens.text,
      "--sidebar-border": border,
      "--sidebar-ring": tokens.focusRing ?? tokens.accent,
    },
  };
}

function normalizeZedTheme(filePath: string, file: ZedThemeFile): AppTheme[] {
  if (!Array.isArray(file.themes)) {
    return [];
  }

  return file.themes
    .map((theme) => {
      if (!theme.name || !theme.appearance || !theme.style) {
        return null;
      }

      const slugBase = `${file.name ?? "theme"}-${theme.name}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const id =
        slugBase || filePath.split("/").pop()?.replace(".json", "") || "theme";
      const appearance = theme.appearance;
      const style = theme.style;
      const primaryText = String(style.text ?? "#000000");
      const mutedText = String(style["text.muted"] ?? primaryText);
      const placeholderText = String(style["text.placeholder"] ?? mutedText);
      const accent = String(style["text.accent"] ?? style.info ?? "#7aa2f7");
      const bg = String(style.background ?? style["editor.background"] ?? "#111111");
      const surface = String(style["surface.background"] ?? style["panel.background"] ?? bg);
      const elevatedSurface = String(style["elevated_surface.background"] ?? surface);
      const tertiarySurface = String(style["element.active"] ?? style["element.hover"] ?? elevatedSurface);
      const border = String(style.border ?? style["border.variant"] ?? tertiarySurface);
      const separator = String(style["border.variant"] ?? border);

      return {
        id,
        name: theme.name,
        appearance,
        variables: {
          "--radius-frame-bg": bg,
          "--radius-bg-primary": surface,
          "--radius-bg-secondary": elevatedSurface,
          "--radius-bg-tertiary": tertiarySurface,
          "--radius-text-primary": primaryText,
          "--radius-text-secondary": mutedText,
          "--radius-text-muted": placeholderText,
          "--radius-text-inverse": appearance === "dark" ? "#111111" : "#ffffff",
          "--radius-accent": accent,
          "--radius-accent-hover": accent,
          "--radius-accent-subtle": String(
            style["search.match_background"] ?? withAlpha(accent, 0.18)
          ),
          "--radius-success": String(style.success ?? accent),
          "--radius-warning": String(style.warning ?? accent),
          "--radius-error": String(style.error ?? accent),
          "--radius-info": String(style.info ?? accent),
          "--radius-border-subtle": separator,
          "--radius-border": border,
          "--background": bg,
          "--foreground": primaryText,
          "--card": surface,
          "--card-foreground": primaryText,
          "--popover": elevatedSurface,
          "--popover-foreground": primaryText,
          "--primary": accent,
          "--primary-foreground": appearance === "dark" ? "#111111" : "#ffffff",
          "--secondary": elevatedSurface,
          "--secondary-foreground": primaryText,
          "--muted": tertiarySurface,
          "--muted-foreground": mutedText,
          "--accent": String(style["element.hover"] ?? tertiarySurface),
          "--accent-foreground": primaryText,
          "--destructive": String(style.error ?? accent),
          "--input": border,
          "--ring": String(style["border.focused"] ?? accent),
          "--sidebar": elevatedSurface,
          "--sidebar-foreground": primaryText,
          "--sidebar-primary": accent,
          "--sidebar-primary-foreground": appearance === "dark" ? "#111111" : "#ffffff",
          "--sidebar-accent": tertiarySurface,
          "--sidebar-accent-foreground": primaryText,
          "--sidebar-border": border,
          "--sidebar-ring": String(style["border.focused"] ?? accent),
        },
      } satisfies AppTheme;
    })
    .filter((theme): theme is AppTheme => theme !== null);
}

export const APP_THEMES = Object.entries(themeFiles)
  .flatMap(([filePath, themeFile]) => {
    if ("themes" in themeFile) {
      return normalizeZedTheme(filePath, themeFile);
    }

    const theme = normalizeFlatTheme(themeFile);
    return theme ? [theme] : [];
  })
  .sort((left, right) => left.name.localeCompare(right.name));

export const DEFAULT_THEME_ID =
  APP_THEMES.find((theme) => theme.id === "dark")?.id ??
  APP_THEMES[0]?.id ??
  "dark";

export const getThemeById = (themeId: string | null | undefined) =>
  APP_THEMES.find((theme) => theme.id === themeId) ?? null;

export function clearThemeVariables(root: HTMLElement) {
  for (const key of THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }
}

export function applyTheme(
  themeId: string,
  root: HTMLElement = document.documentElement
) {
  const theme = getThemeById(themeId);

  root.classList.remove("light", "dark");

  if (!theme) {
    clearThemeVariables(root);
    root.classList.add(themeId === "light" ? "light" : "dark");
    root.style.colorScheme = themeId === "light" ? "light" : "dark";
    root.dataset.theme = themeId;
    return null;
  }

  root.classList.add(theme.appearance);
  root.style.colorScheme = theme.appearance;
  root.dataset.theme = theme.id;

  clearThemeVariables(root);
  for (const [key, value] of Object.entries(theme.variables)) {
    root.style.setProperty(key, value);
  }

  return theme;
}
