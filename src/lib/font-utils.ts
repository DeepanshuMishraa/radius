/**
 * Utility functions for local font detection and runtime application.
 */

const GENERIC_FONTS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded"
]);

/**
 * Robustly checks if a font is installed on the user's system.
 * Uses the Font Loading API when available, falling back to a Canvas
 * text-metric comparison with tolerance for subpixel rounding.
 */
export function isFontInstalled(fontName: string): boolean {
  if (typeof window === "undefined" || !fontName) return false;

  const testName = fontName.trim().replace(/['"]/g, "");
  if (!testName) return false;

  // Generic system fonts are always considered installed.
  if (GENERIC_FONTS.has(testName.toLowerCase())) {
    return true;
  }

  // Modern browsers: document.fonts.check is the most reliable synchronous
  // method for detecting installed local fonts.
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      if (document.fonts.check(`12px "${testName}"`)) return true;
      if (document.fonts.check(`16px "${testName}"`)) return true;
      if (document.fonts.check(`72px "${testName}"`)) return true;
    } catch {
      // Fall through to canvas method
    }
  }

  // Canvas fallback for older engines or when fonts.check is unreliable.
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    // Use a large font size and varied string for maximum metric differentiation.
    const testString =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    const fontSize = 144;

    context.font = `${fontSize}px sans-serif`;
    const sansWidth = context.measureText(testString).width;

    context.font = `${fontSize}px "${testName}", sans-serif`;
    const testSansWidth = context.measureText(testString).width;

    // Also compare against serif to catch fonts that happen to match sans-serif metrics.
    context.font = `${fontSize}px serif`;
    const serifWidth = context.measureText(testString).width;

    context.font = `${fontSize}px "${testName}", serif`;
    const testSerifWidth = context.measureText(testString).width;

    const EPSILON = 0.5;
    return (
      Math.abs(testSansWidth - sansWidth) > EPSILON ||
      Math.abs(testSerifWidth - serifWidth) > EPSILON
    );
  } catch (e) {
    console.warn("Font check failed:", e);
    return false;
  }
}

export interface FontSettings {
  uiFont?: string;
  readerFont?: string;
  fontSize?: number;
}

export const UI_SETTINGS_EVENT = "radius:ui-settings-changed";
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 18;

function normalizeStoredFontValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStoredFontSize(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsed));
}

export function normalizeUISettings(input: {
  uiFont?: string | null;
  readerFont?: string | null;
  fontSize?: string | number | null;
}): FontSettings {
  const normalizedFontSize =
    typeof input.fontSize === "number"
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, input.fontSize))
      : normalizeStoredFontSize(input.fontSize ?? null);

  return {
    uiFont: normalizeStoredFontValue(input.uiFont ?? null),
    readerFont: normalizeStoredFontValue(input.readerFont ?? null),
    fontSize: normalizedFontSize,
  };
}

/**
 * Instantly applies user customizations directly to CSS custom properties
 * on the document element.
 */
export function applyUISettings(settings: FontSettings) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  if (settings.uiFont) {
    const uiFont = settings.uiFont.trim();
    // Inject font values directly into the document root custom variables
    root.style.setProperty("--font-family-sans", `"${uiFont}", ui-sans-serif, system-ui, sans-serif`);
    root.style.setProperty("--font-family-display", `"${uiFont}", ui-sans-serif, system-ui, sans-serif`);
  }

  if (settings.readerFont !== undefined) {
    if (settings.readerFont) {
      const readerFont = settings.readerFont.trim();
      root.style.setProperty("--font-family-reader", `"${readerFont}", ui-sans-serif, system-ui, sans-serif`);
    } else {
      root.style.removeProperty("--font-family-reader");
    }
  }

  if (settings.fontSize !== undefined) {
    // Proportional UI scaling mapping, using 14px as scale = 1.0 (Medium / default).
    const zoom = settings.fontSize / DEFAULT_FONT_SIZE;
    root.style.setProperty("--radius-app-zoom", zoom.toString());
  }

  window.dispatchEvent(new CustomEvent(UI_SETTINGS_EVENT, { detail: settings }));
}
