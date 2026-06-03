import { isSignupAllowed } from "@/lib/access-control";
import { db } from "@/lib/db";
import { accounts, sessions, users, verifications } from "@/lib/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}

/**
 * Better Auth configuration — email/password only for v1.
 * Google OAuth slot reserved (env vars exist but no provider wired yet).
 * When the user is ready: add `socialProviders.google` block here, no other changes.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  // Origins allowed to call the auth API. Derived from the configured public
  // URLs so a domain change only needs the env vars updated (no code edit).
  // Both vars must point at the domain the app is actually served from, or the
  // browser's same-origin auth fetch is rejected as a cross-origin request.
  trustedOrigins: [
    ...new Set(
      [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]
        .filter((u): u is string => Boolean(u))
        .map((u) => u.replace(/\/$/, "")),
    ),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh session if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min cookie cache for hot-path session checks
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
      status: { type: "string", required: false, defaultValue: "approved", input: false },
    },
  },
  advanced: {
    cookiePrefix: "compass",
  },
  databaseHooks: {
    user: {
      create: {
        // Invite-only: reject account creation for emails not on the allowlist
        // (ALLOWED_EMAILS env + ADMIN_EMAIL). Layer 1 of access control; layer 2
        // (admin approval via users.status) gates login after this passes.
        before: async (user) => {
          if (!isSignupAllowed(user.email)) {
            throw new APIError("FORBIDDEN", {
              message: "Compass is invite-only right now. Ask the owner for access.",
            });
          }
          // New accounts start "pending" and need admin approval (layer 2), EXCEPT
          // the bootstrap admin, who is auto-approved so they can run /admin/users.
          const isAdminEmail =
            user.email.trim().toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase();
          return { data: { ...user, status: isAdminEmail ? "approved" : "pending" } };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
