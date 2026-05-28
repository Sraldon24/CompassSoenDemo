import {
  GROQ_LIMITS,
  _resetGroqQuotaForTesting,
  checkQuota,
  recordGroqUsage,
  snapshotGroqUsage,
} from "@/lib/ai/groq-quota";
import { afterEach, describe, expect, it } from "vitest";

describe("Groq quota tracker", () => {
  afterEach(() => {
    _resetGroqQuotaForTesting();
  });

  it("exposes the published Groq free-tier limits accurately", () => {
    // Numbers must match https://console.groq.com/docs/rate-limits exactly.
    expect(GROQ_LIMITS["llama-3.3-70b-versatile"]).toEqual({
      rpd: 1_000,
      tpd: 100_000,
      rpm: 30,
      tpm: 12_000,
    });
    expect(GROQ_LIMITS["llama-3.1-8b-instant"]).toEqual({
      rpd: 14_400,
      tpd: 500_000,
      rpm: 30,
      tpm: 6_000,
    });
  });

  it("starts at 0% used", () => {
    const q = checkQuota("llama-3.3-70b-versatile");
    expect(q.shouldThrottle).toBe(false);
    expect(q.pctUsed).toBe(0);
    expect(q.requestsRemaining).toBe(1_000);
    expect(q.tokensRemaining).toBe(100_000);
  });

  it("does NOT throttle at 50% usage", () => {
    for (let i = 0; i < 500; i++) recordGroqUsage("llama-3.3-70b-versatile", 0);
    const q = checkQuota("llama-3.3-70b-versatile");
    expect(q.shouldThrottle).toBe(false);
  });

  it("DOES throttle at ≥85% request usage", () => {
    for (let i = 0; i < 850; i++) recordGroqUsage("llama-3.3-70b-versatile", 0);
    const q = checkQuota("llama-3.3-70b-versatile");
    expect(q.shouldThrottle).toBe(true);
    expect(q.reason).toMatch(/request quota/i);
  });

  it("DOES throttle at ≥85% token usage even if request count is low", () => {
    // 5 requests but 90K tokens (> 85% of 100K cap).
    for (let i = 0; i < 5; i++) recordGroqUsage("llama-3.3-70b-versatile", 18_000);
    const q = checkQuota("llama-3.3-70b-versatile");
    expect(q.shouldThrottle).toBe(true);
    expect(q.reason).toMatch(/token quota/i);
  });

  it("tracks 70B and 8B independently", () => {
    for (let i = 0; i < 850; i++) recordGroqUsage("llama-3.3-70b-versatile", 0);
    const q70 = checkQuota("llama-3.3-70b-versatile");
    const q8 = checkQuota("llama-3.1-8b-instant");
    expect(q70.shouldThrottle).toBe(true);
    expect(q8.shouldThrottle).toBe(false);
  });

  it("snapshotGroqUsage returns both models' state with limits", () => {
    recordGroqUsage("llama-3.3-70b-versatile", 1000);
    const snap = snapshotGroqUsage();
    expect(snap["llama-3.3-70b-versatile"].requests).toBe(1);
    expect(snap["llama-3.3-70b-versatile"].tokens).toBe(1000);
    expect(snap["llama-3.3-70b-versatile"].rpd).toBe(1000);
    expect(snap["llama-3.1-8b-instant"].requests).toBe(0);
  });
});
