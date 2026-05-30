/**
 * Shared course-code normalization for API routes.
 *
 * Previously copy-pasted in difficulty/route.ts + reviews/route.ts, with a
 * SUBTLY NARROWER regex in community/route.ts (`\d{3}` vs `\d{3,4}[A-Z]?`) —
 * a latent bug. This is the single source of truth; the broad regex matches
 * codes like "COMP 472", "ENGR 6991", "COMP 339A".
 */

export const COURSE_CODE_RX = /^[A-Z]{3,4}\s\d{3,4}[A-Z]?$/;

/** Decode + uppercase + validate a `[code]` path segment. Returns null if it
 * isn't a well-formed course code. */
export function normalizeCourseCode(raw: string): string | null {
  const decoded = decodeURIComponent(raw).trim().toUpperCase();
  return COURSE_CODE_RX.test(decoded) ? decoded : null;
}
