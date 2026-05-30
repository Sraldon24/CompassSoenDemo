/**
 * Term — single source of truth for academic-term parsing, ordering, ranges,
 * grouping, and calendar-date mapping.
 *
 * Pure / in-process: no DB, no I/O, no `Date.now` in the ordering core. This is
 * the lowest-level leaf module — `validation/plan.ts`, `db/queries/plan.ts`,
 * `exports/*`, the import route, and the server actions all depend on it; it
 * depends on nothing in the project except `zod` (for the reusable schema).
 *
 * Two parse modes, deliberately separate:
 *   - `parseTerm` is CASE-INSENSITIVE and lenient — used for trusted/internal
 *     data and the import path where season casing varies.
 *   - `TERM_REGEX` / `termSchema` are STRICT (case-sensitive) — reuse these for
 *     user-input guards so validation never loosens.
 */

import { z } from "zod";

export type TermSeason = "Fall" | "Winter" | "Summer";

export interface TermLabel {
  /** Original label string, e.g. "Fall 2026". */
  raw: string;
  season: TermSeason;
  year: number;
}

/** Chronological order WITHIN an academic year. Single source of truth. */
const SEASON_ORDER: Record<TermSeason, number> = { Winter: 0, Summer: 1, Fall: 2 };
/** Season cycle for stepping forward; Fall rolls over to Winter of the next year. */
const SEASON_CYCLE: readonly TermSeason[] = ["Winter", "Summer", "Fall"];

/** Strict, case-sensitive matcher for user-input guards. Reuse in Zod. */
export const TERM_REGEX = /^(Fall|Winter|Summer)\s+\d{4}$/;
/** Drop-in Zod schema for server actions / forms. Case-sensitive. */
export const termSchema = z.string().regex(TERM_REGEX, "Format: 'Fall 2026'");

/**
 * Parse a term label, case-insensitively. Returns null on malformed input.
 * Canonicalizes the season to Title-case in the returned struct; `raw`
 * preserves the original string exactly.
 */
export function parseTerm(label: string): TermLabel | null {
  const m = label.match(/^(Fall|Winter|Summer)\s+(\d{4})$/i);
  if (!m?.[1] || !m[2]) return null;
  const season = (m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) as TermSeason;
  return { raw: label, season, year: Number(m[2]) };
}

/** Canonical label from parts: ("Fall", 2026) → "Fall 2026". */
export function formatTerm(season: TermSeason, year: number): string {
  return `${season} ${year}`;
}

/**
 * Lenient year extractor — grabs any 4-digit run; 0 if none.
 * Matches the existing `termYear` copies (import path deals with messy cells,
 * not just canonical labels). For strict validation use `TERM_REGEX`.
 */
export function termYear(label: string): number {
  const m = label.match(/(\d{4})/);
  return m?.[1] ? Number(m[1]) : 0;
}

/**
 * Monotonic total order across all terms. Accepts a parsed `TermLabel` (the
 * validation hot path — no re-parse) or a raw string.
 *
 * For a raw string that fails to parse, returns `Number.NEGATIVE_INFINITY` so
 * the comparison helpers stay branchless; prefer `isTermBefore`/`isSameTerm`,
 * which guard correctly, over calling this directly on untrusted strings.
 */
export function termOrdinal(term: TermLabel | string): number {
  const t = typeof term === "string" ? parseTerm(term) : term;
  if (!t) return Number.NEGATIVE_INFINITY;
  return t.year * 3 + SEASON_ORDER[t.season];
}

/** True iff `a` is strictly before `b`. False if either is unparseable. */
export function isTermBefore(a: TermLabel | string, b: TermLabel | string): boolean {
  const oa = termOrdinal(a);
  const ob = termOrdinal(b);
  if (!Number.isFinite(oa) || !Number.isFinite(ob)) return false;
  return oa < ob;
}

/** True iff `a` and `b` are the same term. False if either is unparseable. */
export function isSameTerm(a: TermLabel | string, b: TermLabel | string): boolean {
  const oa = termOrdinal(a);
  const ob = termOrdinal(b);
  if (!Number.isFinite(oa) || !Number.isFinite(ob)) return false;
  return oa === ob;
}

/** The term immediately after `term` (Fall N → Winter N+1). */
function nextTerm(term: TermLabel): TermLabel {
  const idx = SEASON_CYCLE.indexOf(term.season);
  if (idx === SEASON_CYCLE.length - 1) {
    return { season: "Winter", year: term.year + 1, raw: formatTerm("Winter", term.year + 1) };
  }
  const season = SEASON_CYCLE[idx + 1] as TermSeason;
  return { season, year: term.year, raw: formatTerm(season, term.year) };
}

/**
 * Deterministic inclusive list of term labels from `start` → `end`.
 * Returns [] if either endpoint is unparseable or start is after end.
 */
export function termRange(startLabel: string, endLabel: string): string[] {
  const start = parseTerm(startLabel);
  const end = parseTerm(endLabel);
  if (!start || !end) return [];
  const endOrd = termOrdinal(end);
  const out: string[] = [];
  let cur = start;
  while (termOrdinal(cur) <= endOrd) {
    out.push(formatTerm(cur.season, cur.year));
    cur = nextTerm(cur);
  }
  return out;
}

/** Sort term-label strings chronologically. Unparseable labels fall back to localeCompare. */
export function sortTerms(terms: string[]): string[] {
  return [...terms].sort((a, b) => {
    const oa = termOrdinal(a);
    const ob = termOrdinal(b);
    if (!Number.isFinite(oa) || !Number.isFinite(ob)) return a.localeCompare(b);
    return oa - ob;
  });
}

/**
 * Group items by their term label. `keep` optionally filters items in (used by
 * the PDF export to drop dropped/disc/failed). Returns a fresh Map; iteration
 * order is insertion order — call `sortTerms` on the keys if you need ordering.
 */
export function groupByTerm<T extends { term: string }>(
  items: readonly T[],
  keep?: (item: T) => boolean,
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    if (keep && !keep(item)) continue;
    const existing = m.get(item.term);
    if (existing) {
      existing.push(item);
    } else {
      m.set(item.term, [item]);
    }
  }
  return m;
}

/** Best-effort term-start anchors as "MM-DD" (Concordia placeholder dates). */
const TERM_START_DATES: Record<TermSeason, string> = {
  Fall: "09-04",
  Winter: "01-08",
  Summer: "05-06",
};

/**
 * Best-effort ISO start date for a labeled term, e.g. "Fall 2026" → "2026-09-04".
 * Real Concordia dates vary year-to-year — close enough for a calendar
 * placeholder; the user adjusts in their calendar app. Returns null if unparseable.
 */
export function termToStartDate(termLabel: string): string | null {
  const t = parseTerm(termLabel);
  if (!t) return null;
  return `${t.year}-${TERM_START_DATES[t.season]}`;
}
