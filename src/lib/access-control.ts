/**
 * Access control — Compass is invite-only (it's for the owner + approved friends).
 *
 * Two layers:
 *   1. Signup allowlist (this file): `ALLOWED_EMAILS` env (comma-separated) +
 *      ADMIN_EMAIL are permitted to create an account at all. Everyone else is
 *      rejected at signup. This is the cheap, $0, no-DB interim gate.
 *   2. Admin approval (users.status): even an allowlisted signup starts as
 *      `pending` until an admin approves — enforced in middleware + the
 *      /admin/users page. (Layer 2 lives elsewhere; this file is layer 1.)
 *
 * Mirrors the env-bootstrap pattern in `is-admin.ts`.
 */

/** Parse ALLOWED_EMAILS (comma/space/newline separated) into a lowercased set. */
function allowedSet(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const set = new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (admin) set.add(admin);
  return set;
}

/**
 * True if this email may create an account.
 *
 * Fail-safe default: if ALLOWED_EMAILS is UNSET (and no ADMIN_EMAIL), we do NOT
 * lock everyone out — that would brick local dev. An empty allowlist means
 * "open" only when the env var is entirely absent; once you set ALLOWED_EMAILS,
 * it's strictly enforced.
 */
export function isSignupAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlistConfigured = Boolean(
    (process.env.ALLOWED_EMAILS ?? "").trim() || process.env.ADMIN_EMAIL?.trim(),
  );
  if (!allowlistConfigured) return true; // not configured → open (dev/bootstrap)
  return allowedSet().has(email.trim().toLowerCase());
}
