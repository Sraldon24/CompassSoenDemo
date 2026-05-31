"use client";

/**
 * Global keyboard-shortcuts help modal.
 *
 * Press "?" (Shift+/) anywhere outside an input to open it; Escape closes.
 * Self-contained overlay — no dialog dependency. Mounted once in the dashboard
 * layout. The shortcuts it documents (⌘K, G-then-X navigation) are owned by
 * their respective components; this modal is the discoverability surface.
 */

import { useCallback, useEffect, useState } from "react";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["G", "D"], label: "Go to Dashboard" },
  { keys: ["G", "P"], label: "Go to My Plan" },
  { keys: ["G", "M"], label: "Go to Prereq Map" },
  { keys: ["G", "C"], label: "Go to Ask Compass" },
  { keys: ["G", "R"], label: "Go to Requirements" },
  { keys: ["Esc"], label: "Close dialogs / overlays" },
];

/** True when focus is in a text field — so "?" while typing inserts a literal ?. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

export function KeyboardShortcuts(): React.ReactElement | null {
  const [open, setOpen] = useState(false);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    // "?" is Shift+/ — only when not typing into a field.
    if (e.key === "?" && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse convenience; Escape (global keydown above) is the keyboard equivalent.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stops backdrop dismissal; no keyboard action intended. */}
      <div
        className="w-full max-w-md rounded-lg border p-5 space-y-3"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border px-1.5 py-0.5 text-xs font-mono"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-surface-muted)",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
