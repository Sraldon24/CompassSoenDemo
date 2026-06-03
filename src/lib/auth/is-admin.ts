/**
 * Admin gate — used by /admin/* layouts and admin-only API routes.
 *
 * Returns true when the user is either:
 *   1. Marked role="admin" in the users table, OR
 *   2. Logged in with the email matching process.env.ADMIN_EMAIL
 *
 * The env-based check exists so the first admin can bootstrap without
 * touching the DB. In prod, set ADMIN_EMAIL once and that account becomes
 * the seed admin that can elevate others.
 */

interface AdminSession {
  user?: {
    email?: string | null;
    role?: string | null;
  } | null;
}

export function isAdmin(session: AdminSession | null | undefined): boolean {
  const email = session?.user?.email;
  if (!email) return false;

  const envAdmin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (envAdmin && email.trim().toLowerCase() === envAdmin) {
    return true;
  }

  return session?.user?.role === "admin";
}
