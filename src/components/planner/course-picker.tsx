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
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center p-4 pt-24"
      style={{
        background: "color-mix(in oklch, var(--color-bg) 55%, transparent)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Add a course to ${term}`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stops backdrop dismissal; no keyboard action intended. */}
      <div
        className="animate-rise w-full max-w-md overflow-hidden rounded-2xl ring-hairline shadow-[var(--shadow-xl)]"
        style={{ background: "var(--gradient-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <p className="eyebrow mb-1">ADD COURSE</p>
          <div className="text-sm font-semibold mb-3">Add course to {term}</div>
          <input
            // biome-ignore lint/a11y/noAutofocus: search field in a modal the user just opened
            autoFocus
            className="w-full rounded-lg ring-hairline px-3 py-2 text-sm transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]"
            style={{ background: "var(--color-surface-2)" }}
            placeholder="Search by code or title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto scroll-slim p-1.5">
          {matches.length === 0 ? (
            <li
              className="px-3 py-6 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              No matching courses.
            </li>
          ) : (
            matches.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  onClick={() => onPick(c.code)}
                >
                  <span className="mono tnum shrink-0 font-medium">{c.code}</span>
                  <span className="truncate" style={{ color: "var(--color-text-muted)" }}>
                    {c.title}
                  </span>
                  <span
                    className="mono tnum ml-auto shrink-0 text-xs"
                    style={{ color: "var(--color-text-subtle)" }}
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
