/**
 * Tests for the invite-only signup allowlist (isSignupAllowed).
 *
 * The critical safety properties:
 *   - UNSET env → open (so local dev / bootstrap isn't bricked).
 *   - CONFIGURED env → strictly enforced (randoms blocked).
 *   - ADMIN_EMAIL always allowed; matching is case-insensitive.
 */

import { isSignupAllowed } from "@/lib/access-control";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ORIG_ALLOWED = process.env.ALLOWED_EMAILS;
const ORIG_ADMIN = process.env.ADMIN_EMAIL;

function unset(key: string): void {
  Reflect.deleteProperty(process.env, key);
}

function setEnv(allowed?: string, admin?: string) {
  if (allowed === undefined) unset("ALLOWED_EMAILS");
  else process.env.ALLOWED_EMAILS = allowed;
  if (admin === undefined) unset("ADMIN_EMAIL");
  else process.env.ADMIN_EMAIL = admin;
}

beforeEach(() => setEnv(undefined, undefined));
afterEach(() => {
  if (ORIG_ALLOWED === undefined) unset("ALLOWED_EMAILS");
  else process.env.ALLOWED_EMAILS = ORIG_ALLOWED;
  if (ORIG_ADMIN === undefined) unset("ADMIN_EMAIL");
  else process.env.ADMIN_EMAIL = ORIG_ADMIN;
});

describe("isSignupAllowed", () => {
  it("is OPEN when no allowlist is configured (dev/bootstrap)", () => {
    expect(isSignupAllowed("anyone@example.com")).toBe(true);
  });

  it("allows emails on the allowlist", () => {
    setEnv("friend@gmail.com, sraldon24@gmail.com");
    expect(isSignupAllowed("friend@gmail.com")).toBe(true);
  });

  it("blocks emails NOT on the allowlist once configured", () => {
    setEnv("friend@gmail.com");
    expect(isSignupAllowed("rando@evil.com")).toBe(false);
  });

  it("always allows ADMIN_EMAIL even if not in ALLOWED_EMAILS", () => {
    setEnv("friend@gmail.com", "me@admin.com");
    expect(isSignupAllowed("me@admin.com")).toBe(true);
  });

  it("matches case-insensitively and trims", () => {
    setEnv("friend@gmail.com");
    expect(isSignupAllowed("  FRIEND@GMAIL.COM ")).toBe(true);
  });

  it("rejects empty / null email", () => {
    setEnv("friend@gmail.com");
    expect(isSignupAllowed("")).toBe(false);
    expect(isSignupAllowed(null)).toBe(false);
    expect(isSignupAllowed(undefined)).toBe(false);
  });

  it("enforces the allowlist when only ADMIN_EMAIL is set (no ALLOWED_EMAILS)", () => {
    setEnv(undefined, "me@admin.com");
    expect(isSignupAllowed("me@admin.com")).toBe(true);
    expect(isSignupAllowed("rando@evil.com")).toBe(false);
  });
});
