/**
 * Slug helpers — pure, importable from anywhere (server actions can't export
 * non-async functions, so this lives outside the "use server" boundary).
 */

/** Lowercase, hyphenate, strip junk. "Amir Ghadimi!" → "amir-ghadimi". */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
