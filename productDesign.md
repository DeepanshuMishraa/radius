# Design System — Radius

## Product Context
- **What this is:** A minimal, distraction-free desktop email client. Gmail-only, read-only for v1. Built with Electrobun + React + Tailwind.
- **Who it's for:** People who find Gmail cluttered and overwhelming. Folks who want to read email without promos, tabs, ads, or distractions.
- **Space/industry:** Productivity tools / email clients. Peers: Superhuman, Apple Mail, Mimestream, Carbon Mail.
- **Project type:** Desktop app (macOS-first) — a tool you open to read email.
- **The memorable thing:** You open it and your inbox is just *there* — no loading, no clutter, no noise. It feels like the room got quieter.

## Aesthetic Direction
- **Direction:** Warm Minimal
- **Decoration level:** Minimal — no gradients, no blobs, no decorative elements. Typography IS the decoration.
- **Mood:** Calm, inviting, human. Not clinical, not corporate. Like a well-designed living room.
- **Rationale:** Every competitor goes dark-first (Superhuman, Carbon) or sterile (Apple Mail). Radius owns warm, light-mode-first calm.

## Typography

### Font Stack
- **Display/Hero:** Satoshi — geometric, clean, slightly warm. Distinctive without being loud. Used for app title, onboarding headings.
- **Body (UI):** Instrument Sans — humanist, readable, warm feel. Used for inbox rows, buttons, labels, navigation.
- **Body (email reader):** Newsreader — proper book typography. Generous, calm, designed for long-form reading. Used exclusively in the reader view.
- **Data/Tables:** DM Sans (tabular-nums) — clean numbers for dates, counts, metadata.

### Loading Strategy
Load from Google Fonts via `<link>` tags in `src/mainview/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Satoshi:wght@400;500;600;700&display=swap" rel="stylesheet">
```

*Note: Satoshi may require self-hosting or use of a CDN like Fontshare (`https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700`). Verify availability before shipping.*

### Type Scale
Uses a 1.25 (major third) modular scale with base 16px:

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-xs` | 12px | 1.4 | 400 | Metadata, timestamps, badges |
| `text-sm` | 14px | 1.5 | 400 | Secondary text, labels, hints |
| `text-base` | 16px | 1.6 | 400 | Body text, inbox rows, buttons |
| `text-lg` | 20px | 1.4 | 500 | Section headings, dialog titles |
| `text-xl` | 25px | 1.3 | 600 | Page headings, onboarding titles |
| `text-2xl` | 31px | 1.2 | 600 | Hero text, app branding |
| `text-3xl` | 39px | 1.1 | 700 | Splash screen, major announcements |

**Email reader override:** Body text in reader view uses Newsreader at 18px/1.7 for comfortable reading.

## Color

### Approach
Restrained — 1 accent + neutrals. Color is rare and meaningful. The near-white background dominates. The accent appears only for interactive elements and selection states.

### Palette

```css
:root {
  /* Background */
  --bg-primary: #FDFCF8;       /* Warm white — main app background */
  --bg-secondary: #F7F5F0;     /* Slightly warmer — cards, elevated surfaces */
  --bg-tertiary: #EFEBE4;      /* Warm gray — hover states, subtle separation */

  /* Text */
  --text-primary: #1A1A1A;     /* Near-black — headings, primary content */
  --text-secondary: #5C5C5C;   /* Warm gray — secondary text, metadata */
  --text-muted: #9E9A93;       /* Muted warm gray — timestamps, hints */
  --text-inverse: #FDFCF8;     /* Warm white — text on dark surfaces */

  /* Accent */
  --accent: #C4785A;           /* Muted terracotta — selection, focus, active states */
  --accent-hover: #B56A4D;     /* Darker terracotta — hover */
  --accent-subtle: #F5E6E0;    /* Very light terracotta — subtle highlights */

  /* Semantic */
  --success: #5A8C6F;          /* Muted sage green */
  --warning: #C4A35A;          /* Muted gold */
  --error: #C45A5A;            /* Muted brick red */
  --info: #5A7DC4;             /* Muted blue */

  /* Borders */
  --border-subtle: #E8E4DE;    /* Hairline borders (used sparingly) */
}
```

### Dark Mode (v2)
When dark mode is added, reduce saturation 15-20% and warm up the grays:
```css
[data-theme="dark"] {
  --bg-primary: #1C1C1A;       /* Warm charcoal */
  --bg-secondary: #242422;     /* Elevated surfaces */
  --bg-tertiary: #2E2E2C;      /* Hover states */
  --text-primary: #E8E6E3;     /* Warm white */
  --text-secondary: #A8A49D;   /* Warm gray */
  --text-muted: #6E6A63;       /* Muted gray */
  --accent: #D4917A;           /* Lighter terracotta for dark bg */
}
```

## Spacing

### Base Unit
8px base unit. All spacing derives from this.

### Scale
| Token | Value | Usage |
|-------|-------|-------|
| `space-px` | 1px | Hairline borders |
| `space-0.5` | 2px | Tight gaps |
| `space-1` | 4px | Icon padding, tight internal spacing |
| `space-2` | 8px | Base unit — button padding, small gaps |
| `space-3` | 12px | Medium internal padding |
| `space-4` | 16px | Standard padding — cards, dialogs |
| `space-5` | 20px | Medium section spacing |
| `space-6` | 24px | Large gaps — between email rows |
| `space-8` | 32px | Section padding |
| `space-10` | 40px | Major section separation |
| `space-12` | 48px | Hero spacing |
| `space-16` | 64px | Page-level padding |

### Density
Comfortable — not cramped, not spacious. The inbox is dense enough to scan efficiently. The reader is generous enough to feel relaxed.

## Layout

### Approach
Grid-disciplined for inbox (efficiency). Creative-editorial for reader (comfort).

### Inbox Layout
```
+----------------------------------------------------------+
|  Radius                              12 unread · 847 total |  ← Header (48px)
+----------------------------------------------------------+
|                                                           |
|  Sarah Chen                           Design review...    |  ← Email row 1
|                                      10:24 AM             |
|                                                           |  ← 24px gap
|  Linear                               [RAD-42] Add...     |  ← Email row 2
|                                       9:15 AM             |
|                                                           |
|  ...                                                      |
|                                                           |
+----------------------------------------------------------+
```
- Full-width rows, no card containers
- No borders between rows — separation via 24px whitespace
- Single-line: sender (left) + subject (center, truncated) + date (right)
- Row height: 48px
- Selected row: subtle warm background (`--bg-tertiary`) + left border accent (3px `--accent`)

### Reader Layout
```
+----------------------------------------------------------+
|  ← Back to Inbox                                          |
+----------------------------------------------------------+
|                                                           |
|              Design review notes from yesterday's sync    |  ← Subject (centered)
|              Sarah Chen · To: you, Kyle, Maria · 10:24 AM |  ← Meta (centered)
|                                                           |
|  +----------------------------------------------------+   |
|  |                                                    |   |
|  |  Hey team — great sync yesterday.                  |   |
|  |                                                    |   |
|  |  Typography pass — We agreed to move to...         |   |  ← Body (centered column)
|  |                                                    |   |
|  |  [inline image placeholder]                        |   |
|  |                                                    |   |
|  |  — Sarah                                           |   |
|  |                                                    |   |
|  +----------------------------------------------------+   |
|              max-width: 680px                             |
+----------------------------------------------------------+
```
- Centered column, max-width 680px
- Newsreader serif at 18px/1.7
- Generous paragraph spacing (16px)
- No reply/forward/archive buttons (read-only is honest)

## Components

### Button
```
Primary: bg-accent, text-inverse, px-4 py-2, rounded-lg, font-medium
Hover: bg-accent-hover, transition-colors duration-80
Ghost: bg-transparent, text-primary, hover:bg-bg-tertiary
```

### Email Row
```
Unselected: bg-transparent, text-primary
Unread: font-semibold (sender), font-medium (subject)
Selected: bg-bg-tertiary, border-l-3 border-accent
Hover (unselected): bg-bg-secondary
```

### Onboarding Screen
```
Centered layout, generous vertical spacing (space-16)
Logo/icon: 48px, subtle
Title: text-2xl, Satoshi, font-semibold
Subtitle: text-base, text-secondary, max-width 400px, centered
CTA: Primary button, large (px-6 py-3)
Footer hint: text-xs, text-muted
```

### Progress Bar (Sync)
```
Track: h-1, bg-bg-tertiary, rounded-full
Fill: h-1, bg-accent, rounded-full, transition-width duration-300
Label: text-xs, text-muted, below bar
```

## Motion

### Approach
Minimal-functional — only transitions that aid comprehension.

### Rules
- **Instant paint:** App opens to content immediately. No splash screen, no loading animation.
- **Selection fade:** 80ms ease-out on row selection background change.
- **Hover transitions:** 80ms ease-out on interactive elements.
- **No entrance animations:** Elements appear instantly. The app feels fast because it IS fast, not because it's animated.
- **Progress bar:** Smooth width transition (300ms) during sync.

### Easing
- `ease-out` for entrances and reveals
- `ease-in-out` for state toggles
- No bouncy or spring physics — calm means predictable motion.

## Anti-Patterns (Never Do)

- Purple/violet gradients
- 3-column feature grids with icons in colored circles
- Centered everything with uniform spacing
- Uniform bubbly border-radius on all elements
- Gradient buttons as primary CTA
- Decorative blobs or abstract shapes
- system-ui / -apple-system as display font
- Preview snippets in inbox rows (stays minimal: sender + subject + date only)

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-28 | Warm Minimal aesthetic | Differentiates from dark-first competitors (Superhuman, Carbon) and sterile alternatives (Apple Mail) |
| 2026-04-28 | Light mode default | Serves "feel at home" positioning — warm light feels inviting, not clinical |
| 2026-04-28 | Serif for email body (Newsreader) | Signals "this is for reading, not scanning." Differentiator in sans-dominant category. |
| 2026-04-28 | No preview snippets | Aggressively minimal — sender + subject + date only. Reduces cognitive load per row. |
| 2026-04-28 | Terracotta accent (#C4785A) | Warm, muted, distinctive without being loud. Evokes clay, earth, calm. |
| 2026-04-28 | Whitespace separation (no borders) | Borders create visual noise. Whitespace creates calm. Core to the product promise. |
| 2026-04-28 | Instant paint, no entrance animations | Speed IS the feature. Animations that hide loading are lies. |

## Tailwind Config Reference

```javascript
// tailwind.config.js additions
module.exports = {
  theme: {
    extend: {
      colors: {
        'radius-bg': {
          primary: '#FDFCF8',
          secondary: '#F7F5F0',
          tertiary: '#EFEBE4',
        },
        'radius-text': {
          primary: '#1A1A1A',
          secondary: '#5C5C5C',
          muted: '#9E9A93',
          inverse: '#FDFCF8',
        },
        'radius-accent': {
          DEFAULT: '#C4785A',
          hover: '#B56A4D',
          subtle: '#F5E6E0',
        },
      },
      fontFamily: {
        'display': ['Satoshi', 'system-ui', 'sans-serif'],
        'sans': ['Instrument Sans', 'system-ui', 'sans-serif'],
        'serif': ['Newsreader', 'Georgia', 'serif'],
        'mono': ['DM Sans', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',   // 72px
        '22': '5.5rem',   // 88px
      },
      transitionDuration: {
        '80': '80ms',
      },
    },
  },
}
```

## Implementation Notes for Tailwind v4

Since this project uses Tailwind CSS v4, configure via CSS instead of JS:

```css
/* src/mainview/index.css */
@import 'tailwindcss';

@theme {
  --color-radius-bg-primary: #FDFCF8;
  --color-radius-bg-secondary: #F7F5F0;
  --color-radius-bg-tertiary: #EFEBE4;
  --color-radius-text-primary: #1A1A1A;
  --color-radius-text-secondary: #5C5C5C;
  --color-radius-text-muted: #9E9A93;
  --color-radius-accent: #C4785A;
  --color-radius-accent-hover: #B56A4D;
  --color-radius-accent-subtle: #F5E6E0;

  --font-family-display: 'Satoshi', system-ui, sans-serif;
  --font-family-sans: 'Instrument Sans', system-ui, sans-serif;
  --font-family-serif: 'Newsreader', Georgia, serif;
}
```
