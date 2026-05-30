/**
 * Unit tests for the API route guards. getSession + guardAiCall are mocked so
 * we test the guard composition (401 / 400 / 429 ordering + envelopes) without
 * a DB or a real limiter.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const guardAiCallMock = vi.fn();

vi.mock("@/lib/get-session", () => ({ getSession: () => getSessionMock() }));
vi.mock("@/lib/limits", () => ({
  guardAiCall: (...args: unknown[]) => guardAiCallMock(...args),
}));

import {
  authGuard,
  authLimitGuard,
  courseGuard,
  courseLimitGuard,
  courseThenLimitGuard,
} from "@/lib/api/route-guard";

const SESSION = { user: { id: "u1", email: "u@x.com" } };
const ALLOWED = { allowed: true, retryAfterMs: 0 };
const BLOCKED = { allowed: false, retryAfterMs: 30_000 };

afterEach(() => {
  getSessionMock.mockReset();
  guardAiCallMock.mockReset();
});

describe("authGuard", () => {
  it("401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const r = await authGuard();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });
  it("ok with session", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const r = await authGuard();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.user.id).toBe("u1");
  });
});

describe("courseGuard (auth + code, no limit)", () => {
  it("401 before code check when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const r = await courseGuard("COMP 472");
    if (!r.ok) expect(r.response.status).toBe(401);
  });
  it("400 invalid_course_code for a malformed code", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const r = await courseGuard("not-a-code");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await r.response.json()).toEqual({ error: "invalid_course_code" });
    }
  });
  it("ok + normalized code (4-digit accepted)", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const r = await courseGuard("engr%206991");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.code).toBe("ENGR 6991");
  });
});

describe("courseLimitGuard (limit BEFORE code — community order)", () => {
  it("429 rate_limited fires before code validation", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    guardAiCallMock.mockReturnValue(BLOCKED);
    // Even with a bad code, the limit check wins (community's historical order).
    const r = await courseLimitGuard("bad-code", "courseCommunity");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(429);
      expect(r.response.headers.get("Retry-After")).toBe("30");
      expect(await r.response.json()).toEqual({ error: "rate_limited", retryAfter: 30 });
    }
  });
  it("ok when allowed + valid code", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    guardAiCallMock.mockReturnValue(ALLOWED);
    const r = await courseLimitGuard("COMP 472", "courseCommunity");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.code).toBe("COMP 472");
  });
});

describe("courseThenLimitGuard (code BEFORE limit — difficulty/reviews order)", () => {
  it("400 invalid code fires BEFORE the limit check", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    guardAiCallMock.mockReturnValue(BLOCKED); // would 429, but code check wins
    const r = await courseThenLimitGuard("bad-code", "courseCommunity");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
    expect(guardAiCallMock).not.toHaveBeenCalled(); // limit never consulted
  });
  it("429 when code valid but rate-limited", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    guardAiCallMock.mockReturnValue(BLOCKED);
    const r = await courseThenLimitGuard("COMP 472", "courseCommunity");
    if (!r.ok) expect(r.response.status).toBe(429);
  });
});

describe("authLimitGuard (flag)", () => {
  it("429 when rate-limited", async () => {
    getSessionMock.mockResolvedValue(SESSION);
    guardAiCallMock.mockReturnValue(BLOCKED);
    const r = await authLimitGuard("moderationFlag");
    if (!r.ok) {
      expect(r.response.status).toBe(429);
      expect(await r.response.json()).toEqual({ error: "rate_limited", retryAfter: 30 });
    }
  });
});
