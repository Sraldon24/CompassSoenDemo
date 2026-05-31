"use client";

/**
 * Course picker overlay for the planner's "Add course" button. Filters the
 * catalog by code/title, excludes courses already in the plan, and calls
 * onPick(courseCode) for the chosen one. Self-contained overlay (no dialog dep).
 */

import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { useMemo, useState } from "react";

interface Props {
  term: string;
  catalog: CourseCatalogEntry[];
  /** Codes already in the plan — excluded from the list. */
  excludeCodes: Set<string>;
  onPick: (courseCode: string) => void;
  onClose: () => void;
}

export function CoursePicker({
  term,
  catalog,
  excludeCodes,
  onPick,
  onClose,
}: Props): React.ReactElement {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((c) => !excludeCodes.has(c.code))
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [catalog, excludeCodes, query]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse convenience; Escape (handled on the input) is the keyboard equivalent.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Add a course to ${term}`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stops backdrop dismissal; no keyboard action intended. */}
      <div
        className="w-full max-w-md rounded-lg border shadow-lg"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-sm font-semibold mb-2">Add course to {term}</div>
          <input
            // biome-ignore lint/a11y/noAutofocus: search field in a modal the user just opened
            autoFocus
            className="w-full rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
            placeholder="Search by code or title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <li
              className="px-3 py-4 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              No matching courses.
            </li>
          ) : (
            matches.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent/10"
                  onClick={() => onPick(c.code)}
                >
                  <span className="mono shrink-0 font-medium">{c.code}</span>
                  <span className="truncate" style={{ color: "var(--color-text-muted)" }}>
                    {c.title}
                  </span>
                  <span
                    className="ml-auto shrink-0 text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {c.credits} cr
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
