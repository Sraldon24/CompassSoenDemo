/**
 * Unit tests for the admin gate.
 *
 * Pure function, deterministic — no DB, no env mocking magic.
 */

import { isAdmin } from "@/lib/auth/is-admin";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ORIGINAL_ADMIN = process.env.ADMIN_EMAIL;

describe("isAdmin", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "sraldon24@gmail.com";
  });
  afterEach(() => {
    process.env.ADMIN_EMAIL = ORIGINAL_ADMIN;
  });

  it("returns true when session email matches ADMIN_EMAIL (case-insensitive)", () => {
    expect(isAdmin({ user: { email: "sraldon24@gmail.com" } })).toBe(true);
    expect(isAdmin({ user: { email: "SRALDON24@GMAIL.COM" } })).toBe(true);
    expect(isAdmin({ user: { email: "  sraldon24@gmail.com  " } })).toBe(true);
  });

  it("returns true when user.role is 'admin' regardless of email", () => {
    expect(isAdmin({ user: { email: "someone-else@example.com", role: "admin" } })).toBe(true);
  });

  it("returns false for a regular user", () => {
    expect(isAdmin({ user: { email: "student@example.com", role: "user" } })).toBe(false);
  });

  it("returns false for null / undefined session", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("returns false when session has no user", () => {
    expect(isAdmin({})).toBe(false);
  });

  it("returns false when session.user has no email", () => {
    expect(isAdmin({ user: {} })).toBe(false);
    expect(isAdmin({ user: { email: null } })).toBe(false);
  });

  it("returns false when ADMIN_EMAIL is unset and role is not 'admin'", () => {
    process.env.ADMIN_EMAIL = "";
    expect(isAdmin({ user: { email: "anyone@example.com", role: "user" } })).toBe(false);
  });

  it("never grants admin via a partial email match", () => {
    expect(isAdmin({ user: { email: "evil-sraldon24@gmail.com" } })).toBe(false);
    expect(isAdmin({ user: { email: "sraldon24@gmail.com.evil" } })).toBe(false);
  });
});
