"use client";

import { useEffect, useState } from "react";

/** The 5 Meridian accent palettes (must match the [data-accent] blocks in
 * globals.css). */
export const ACCENTS = [
  { id: "clementine", label: "Clementine", hex: "#d97333" },
  { id: "cobalt", label: "Cobalt", hex: "#3b5bdb" },
  { id: "moss", label: "Moss", hex: "#3f8f5f" },
  { id: "plum", label: "Plum", hex: "#a13c8f" },
  { id: "maroon", label: "Maroon", hex: "#9d2b2b" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
const STORAGE_KEY = "compass-accent";
const DEFAULT_ACCENT: AccentId = "clementine";

/** Inline script that applies the persisted accent to <html> BEFORE first paint,
 * so there's no color flash on load (same trick next-themes uses for theme). */
export const ACCENT_NO_FLASH_SCRIPT = `(function(){try{var a=localStorage.getItem("${STORAGE_KEY}")||"${DEFAULT_ACCENT}";document.documentElement.setAttribute("data-accent",a);}catch(e){}})();`;

function readAccent(): AccentId {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  const v = window.localStorage.getItem(STORAGE_KEY) as AccentId | null;
  return v && ACCENTS.some((a) => a.id === v) ? v : DEFAULT_ACCENT;
}

export function applyAccent(id: AccentId): void {
  document.documentElement.setAttribute("data-accent", id);
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore quota/private-mode */
  }
}

/** Row of 5 swatches that swap the app accent live + persist it. */
export function AccentPicker(): React.ReactElement {
  const [accent, setAccent] = useState<AccentId>(DEFAULT_ACCENT);

  // Sync from storage on mount (the no-flash script already set the attribute).
  useEffect(() => {
    setAccent(readAccent());
  }, []);

  const pick = (id: AccentId) => {
    setAccent(id);
    applyAccent(id);
  };

  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent color">
      {ACCENTS.map((a) => {
        const on = accent === a.id;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={a.label}
            title={a.label}
            onClick={() => pick(a.id)}
            className="rounded-full transition-transform"
            style={{
              width: 26,
              height: 26,
              background: a.hex,
              border: on ? "2.5px solid var(--ink)" : "2px solid var(--line-strong)",
              outline: on ? `2px solid ${a.hex}` : "none",
              outlineOffset: 2,
              transform: on ? "scale(1.08)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
