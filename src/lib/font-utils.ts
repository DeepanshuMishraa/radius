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
 * Robustly checks if a font is installed on the user's system
 * using a side-by-side Canvas text metric comparison.
 */
export function isFontInstalled(fontName: string): boolean {
  if (typeof window === "undefined" || !fontName) return false;

  const testName = fontName.trim().replace(/['"]/g, "");
  if (!testName) return false;

  // Generic system fonts are always considered installed.
  if (GENERIC_FONTS.has(testName.toLowerCase())) {
    return true;
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return false;

    // We use a varied string of characters to check differences in metrics.
    const testString = "abcdefghijklmnopqrstuvwxyz0123456789";

    // Step 1: Measure baseline widths of generic fonts
    context.font = "72px sans-serif";
    const sansWidth = context.measureText(testString).width;

    context.font = "72px serif";
    const serifWidth = context.measureText(testString).width;

    context.font = "72px monospace";
    const monoWidth = context.measureText(testString).width;

    // Step 2: Measure widths of requested font coupled with generic fallbacks
    // If the font is not installed, the browser falls back to the generic font,
    // making the measured width identical to the baseline fallback width.
    context.font = `72px "${testName}", sans-serif`;
    const testSansWidth = context.measureText(testString).width;

    context.font = `72px "${testName}", serif`;
    const testSerifWidth = context.measureText(testString).width;

    context.font = `72px "${testName}", monospace`;
    const testMonoWidth = context.measureText(testString).width;

    // If the font is installed, it overrides the fallback. Thus, at least one test
    // width will differ from the corresponding raw fallback width.
    return (
      testSansWidth !== sansWidth ||
      testSerifWidth !== serifWidth ||
      testMonoWidth !== monoWidth
    );
  } catch (e) {
    console.warn("Font check failed:", e);
    return false;
  }
}

interface FontSettings {
  uiFont?: string;
  readerFont?: string;
  fontSize?: number;
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

  if (settings.readerFont) {
    const readerFont = settings.readerFont.trim();
    root.style.setProperty("--font-family-reader", `"${readerFont}", ui-sans-serif, system-ui, sans-serif`);
  }

  if (settings.fontSize) {
    // Proportional UI scaling mapping, using 14px as scale = 1.0 (Medium / default).
    const baseFontSize = 14;
    const zoom = settings.fontSize / baseFontSize;
    root.style.setProperty("--radius-app-zoom", zoom.toString());
  }
}
