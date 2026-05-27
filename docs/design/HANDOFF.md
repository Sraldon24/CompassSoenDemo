# SOEN Compass — Engineering handoff

Drop-in design tokens, fonts, and SVG assets for the Next.js 15 + Tailwind v4 + shadcn/ui build.

## 1. Tokens (Tailwind v4 `@theme`)

Paste into `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  /* ---- COLOR (light) — apply on :root ---- */
  --color-bg:           oklch(0.990 0.002 240);
  --color-surface:      oklch(0.980 0.002 240);
  --color-surface-2:    oklch(0.965 0.003 240);
  --color-border:       oklch(0.910 0.004 240);
  --color-border-strong:oklch(0.840 0.005 240);
  --color-text:         oklch(0.180 0.005 240);
  --color-text-muted:   oklch(0.500 0.005 240);
  --color-text-subtle:  oklch(0.630 0.005 240);
  --color-primary:      oklch(0.220 0.010 240);
  --color-primary-hover:oklch(0.150 0.010 240);
  --color-primary-fg:   oklch(0.985 0.002 240);
  --color-accent:       oklch(0.580 0.150 155);
  --color-accent-hover: oklch(0.510 0.160 155);
  --color-accent-soft:  oklch(0.957 0.035 155);
  --color-success:      oklch(0.595 0.130 158);
  --color-success-soft: oklch(0.955 0.025 158);
  --color-warning:      oklch(0.720 0.140 75);
  --color-warning-soft: oklch(0.965 0.030 80);
  --color-danger:       oklch(0.580 0.195 25);
  --color-danger-soft:  oklch(0.960 0.025 25);

  /* ---- TYPE ---- */
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --text-12: 12px; --text-14: 14px; --text-16: 16px; --text-18: 18px;
  --text-20: 20px; --text-24: 24px; --text-30: 30px; --text-36: 36px;

  /* ---- SPACING (4px base) ---- */
  --spacing-1: 4px; --spacing-2: 8px; --spacing-3: 12px;
  --spacing-4: 16px; --spacing-5: 20px; --spacing-6: 24px;
  --spacing-8: 32px; --spacing-10: 40px; --spacing-12: 48px;
  --spacing-16: 64px;

  /* ---- RADIUS ---- */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --radius-xl: 16px; --radius-full: 9999px;

  /* ---- ELEVATION ---- */
  --shadow-sm: 0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.04);
  --shadow-lg: 0 12px 32px rgba(0,0,0,.08), 0 4px 8px rgba(0,0,0,.05);
}

/* ---- DARK MODE — override on .dark ---- */
.dark {
  --color-bg:           oklch(0.150 0.004 240);
  --color-surface:      oklch(0.190 0.005 240);
  --color-surface-2:    oklch(0.225 0.005 240);
  --color-border:       oklch(0.280 0.006 240);
  --color-border-strong:oklch(0.360 0.007 240);
  --color-text:         oklch(0.975 0.003 240);
  --color-text-muted:   oklch(0.700 0.005 240);
  --color-text-subtle:  oklch(0.570 0.005 240);
  --color-primary:      oklch(0.975 0.003 240);
  --color-primary-hover:oklch(0.900 0.004 240);
  --color-primary-fg:   oklch(0.150 0.004 240);
  --color-accent:       oklch(0.725 0.150 155);
  --color-accent-hover: oklch(0.780 0.145 155);
  --color-accent-soft:  oklch(0.278 0.060 155);
  --color-success:      oklch(0.720 0.135 158);
  --color-success-soft: oklch(0.265 0.050 158);
  --color-warning:      oklch(0.800 0.135 75);
  --color-warning-soft: oklch(0.290 0.055 80);
  --color-danger:       oklch(0.700 0.175 25);
  --color-danger-soft:  oklch(0.290 0.070 25);
}
```

## 2. Fonts

Use `next/font/google` for both. Geist needs both `subsets: ["latin"]` and the variable name applied to `<html>`:

```tsx
// app/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export default function Layout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased bg-bg text-text">{children}</body>
    </html>
  );
}
```

**Font features (Geist Mono):** enable slashed zero + `ss01` on all course codes and numeric data.

```css
.mono { font-family: var(--font-mono); font-feature-settings: "ss01", "cv01"; }
.tnum { font-variant-numeric: tabular-nums slashed-zero; }
```

## 3. Brand assets (`brand/`)

| File | Use |
|---|---|
| `mark.svg` | Full color · sidebar, navs, brand chrome |
| `mark-reverse.svg` | For dark / accent backgrounds |
| `mark-mono.svg` | Single color, takes `currentColor` (sidebar nav recolor) |
| `lockup.svg` | Mark + "Compass" wordmark · marketing pages |
| `lockup-reverse.svg` | Lockup for dark backgrounds |
| `favicon.svg` | 32×32 — set as primary favicon |
| `favicon-dark.svg` | For `prefers-color-scheme: dark` |

In `app/layout.tsx`:
```tsx
export const metadata = {
  icons: [
    { rel: "icon", url: "/brand/favicon.svg", media: "(prefers-color-scheme: light)" },
    { rel: "icon", url: "/brand/favicon-dark.svg", media: "(prefers-color-scheme: dark)" },
  ],
};
```

## 4. Component conventions

- **CourseCard** — left 3px status bar + corner badge. States: `planned` / `enrolled` / `done` / `warn`. Grip handle appears on hover for drag.
- **TermColumn** — fixed 320 px width. Header carries name + workload pill. Add-course slot has 4 states: default · hover · drop-target · disabled.
- **WorkloadBadge** — hairline pill with a 4-bar meter inside. `light` (success) / `medium` (neutral) / `heavy` (warning) / `burnout` (danger).
- **StatusBadge** — 22 px pill, 6 states: `planned` / `enrolled` / `done` / `waitlist` / `dropped` / `failed`.
- **AI message** — no chat bubbles. Role label above prose. Citations as superscripts `<sup class="cite">` linking to a chip footer.
- **Focus ring** — 2 px emerald outline, 2 px offset, only on `:focus-visible`.
- **Density** — balanced. Card padding `s-4` / `s-5` / `s-6` (16/20/24 px).

## 5. Numerics

- **Always use tabular-nums + slashed-zero** on: credit counts, GPA, dates, times, course codes, percentages, counters.
- **Proportional** in prose / body copy.

## 6. Accessibility checklist

- All interactive surfaces have `:focus-visible` emerald rings.
- Touch targets ≥ 44 px (`btn-lg` is 40 px height — bump to 44 on mobile if it's a primary touch target).
- Status is never communicated by color alone — always pair with an icon, label, or dot.
- Dark mode independently tested for WCAG AA contrast.

## 7. What's NOT in this handoff

- D3 force-layout code for the Prereq Map (use `d3-force` + the node/edge styles from `Phase 8`).
- Backend / API design. Tokens and components only.
- Animation timing tokens — assume 120 ms ease for most transitions, 200 ms cubic-bezier for toasts/drawers.

---

**Questions for the design team:** open a comment on any Phase HTML file — the inline annotations should make intent clear.
