import {
  LIMITS,
  _resetRateLimitForTesting,
  rateLimit,
  rateLimitByIp,
  rateLimitByUserId,
} from "@/lib/rate-limit";
import { afterEach, describe, expect, it } from "vitest";

describe("rateLimit", () => {
  afterEach(() => {
    _resetRateLimitForTesting();
  });

  it("allows the first hit and reports remaining count", () => {
    const r = rateLimit({
      feature: "ai-chat",
      identity: "u:abc",
      limit: 5,
      windowMs: 1000,
    });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.limit).toBe(5);
    expect(r.retryAfterMs).toBe(0);
  });

  it("blocks the (limit+1)-th hit within the window", () => {
    const opts = { feature: "ai-chat", identity: "u:abc", limit: 3, windowMs: 1000 };
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(opts);
      expect(r.allowed).toBe(true);
    }
    const blocked = rateLimit(opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate buckets per identity", () => {
    const optsA = { feature: "ai-chat", identity: "u:A", limit: 1, windowMs: 1000 };
    const optsB = { feature: "ai-chat", identity: "u:B", limit: 1, windowMs: 1000 };
    expect(rateLimit(optsA).allowed).toBe(true);
    expect(rateLimit(optsB).allowed).toBe(true); // B's first hit
    expect(rateLimit(optsA).allowed).toBe(false); // A's second hit blocked
    expect(rateLimit(optsB).allowed).toBe(false); // B's second hit blocked
  });

  it("tracks separate buckets per feature for the same identity", () => {
    expect(
      rateLimit({ feature: "ai-chat", identity: "u:X", limit: 1, windowMs: 1000 }).allowed,
    ).toBe(true);
    expect(
      rateLimit({ feature: "search", identity: "u:X", limit: 1, windowMs: 1000 }).allowed,
    ).toBe(true);
  });

  it("rateLimitByUserId prefixes identity with u: namespace", () => {
    rateLimitByUserId("user123", "ai-chat", 1, 1000);
    // After 1 hit, second hit must be blocked.
    const r = rateLimitByUserId("user123", "ai-chat", 1, 1000);
    expect(r.allowed).toBe(false);
  });

  it("rateLimitByIp uses ip: namespace and is independent of userId", () => {
    rateLimitByUserId("user123", "search", 1, 1000);
    const r = rateLimitByIp("user123", "search", 1, 1000);
    // Different namespace means user123 as IP gets its own bucket.
    expect(r.allowed).toBe(true);
  });

  it("LIMITS constants match the published defaults (defensive regression)", () => {
    expect(LIMITS.aiChat.limit).toBe(50);
    expect(LIMITS.aiChat.windowMs).toBe(24 * 60 * 60 * 1000);
    expect(LIMITS.aiRecommend.limit).toBe(20);
    expect(LIMITS.aiDraftEmail.limit).toBe(30);
    expect(LIMITS.search.limit).toBe(100);
    expect(LIMITS.search.windowMs).toBe(60 * 60 * 1000);
    expect(LIMITS.import.limit).toBe(5);
    expect(LIMITS.moderationFlag.limit).toBe(10);
  });
});
