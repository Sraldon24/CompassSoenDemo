/**
 * Course-code + cell primitives — single source of truth for the format rules
 * shared by the Excel import path. Pure / in-process, zero project deps.
 *
 * Canonical home for what used to be duplicated across the import route and
 * `scripts/parse-excel.ts` (the standalone seed script keeps its own copies to
 * avoid a `@/` alias import at `tsx` runtime — see docs/REFACTOR.md).
 */

export type UserCourseStatus =
  | "planned"
  | "enrolled"
  | "completed"
  | "transferred"
  | "dropped"
  | "disc"
  | "failed";

/** Anchored matcher for a single, well-formed course code ("COMP 352"). */
export const COURSE_CODE_STRICT = /^[A-Z]{3,4}\s*\d{3}$/;
/** Global matcher for extracting codes embedded in freeform text. */
export const COURSE_CODE_GLOBAL = /\b([A-Z]{3,4})\s*(\d{3})\b/g;

/** True iff `s` is exactly one well-formed course code. */
export function isCourseCode(s: string): boolean {
  return COURSE_CODE_STRICT.test(s);
}

/** Extract all distinct course codes from freeform text, normalized to "DEPT NNN". */
export function extractCourseCodes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(COURSE_CODE_GLOBAL)) {
    const code = `${m[1]} ${m[2]}`;
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** Coerce an unknown spreadsheet cell value to a trimmed-safe string. */
export function cellStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Map a freeform status cell to a normalized course status. Defaults to "planned". */
export function statusFromString(s: string | null): UserCourseStatus {
  if (!s) return "planned";
  const t = s.toLowerCase();
  if (t.includes("transfer")) return "transferred";
  // "completed" is distinct from "transferred" — done HERE vs. credited from
  // elsewhere. Checked before the generic "done" so it isn't swallowed.
  if (t.includes("complet")) return "completed";
  if (t.includes("done")) return "transferred";
  if (t.includes("in progress") || t.includes("enrolled")) return "enrolled";
  if (t.includes("disc")) return "disc";
  if (t.includes("drop")) return "dropped";
  if (t.includes("fail")) return "failed";
  return "planned";
}
