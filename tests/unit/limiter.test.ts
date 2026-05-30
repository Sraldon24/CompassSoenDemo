import type { QuotaCheck } from "@/lib/ai/groq-quota";
import { Limiter, type QuotaSource } from "@/lib/limits/limiter";
import { MemoryLimitStore } from "@/lib/limits/memory-store";
import { describe, expect, it } from "vitest";

function okQuota(): QuotaCheck {
  return { shouldThrottle: false, pctUsed: 0, requestsRemaining: 1000, tokensRemaining: 100000 };
}
function throttledQuota(): QuotaCheck {
  return {
    shouldThrottle: true,
    reason: "Daily request quota 900/1000 used",
    pctUsed: 0.9,
    requestsRemaining: 100,
    tokensRemaining: 50000,
  };
}

function makeLimiter(quota: QuotaSource, now = () => 1_000_000): Limiter {
  return new Limiter(new MemoryLimitStore(), quota, now);
}

const passing: QuotaSource = { check: okQuota, reset: () => {} };

describe("guardAiCall — per-user window", () => {
  it("allows up to the limit then blocks", () => {
    const l = makeLimiter(passing);
    // import: limit 5 / hour
    for (let i = 0; i < 5; i++) {
      expect(
        l.guardAiCall({ feature: "import", identity: { kind: "user", id: "u1" } }).allowed,
      ).toBe(true);
    }
    const blocked = l.guardAiCall({ feature: "import", identity: { kind: "user", id: "u1" } });
    expect(blocked.allowed).toBe(false);
    expect(blocked.denyReason).toBe("rate-limit");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("scopes windows by feature and identity", () => {
    const l = makeLimiter(passing);
    l.guardAiCall({ feature: "import", identity: { kind: "user", id: "A" } });
    // Different identity is independent.
    expect(l.guardAiCall({ feature: "import", identity: { kind: "ip", id: "A" } }).allowed).toBe(
      true,
    );
  });
});

describe("guardAiCall — system quota breaker", () => {
  it("denies with reason 'quota' when the model is throttled", () => {
    const l = makeLimiter({ check: throttledQuota, reset: () => {} });
    const d = l.guardAiCall({
      feature: "aiChat",
      identity: { kind: "user", id: "u1" },
      model: "llama-3.3-70b-versatile",
    });
    expect(d.allowed).toBe(false);
    expect(d.denyReason).toBe("quota");
  });

  it("skips the quota check for non-AI features (no model)", () => {
    const l = makeLimiter({ check: throttledQuota, reset: () => {} });
    // No model → quota never consulted → allowed despite throttle.
    expect(l.guardAiCall({ feature: "search", identity: { kind: "ip", id: "x" } }).allowed).toBe(
      true,
    );
  });
});

describe("withUsage — records on success and on throw", () => {
  it("records usage and returns the result on success", async () => {
    const recorded: number[] = [];
    const l = makeLimiter(passing);
    // Patch estimateTokens to observe; recordAIUsage hits the DB (no-op/catch in tests),
    // so we assert behavior via the return value + estimate invocation.
    const out = await l.withUsage(
      {
        userId: "u1",
        feature: "test",
        model: "cached",
        estimateTokens: (r) => {
          recorded.push(typeof r === "number" ? r : 0);
          return 1;
        },
      },
      async () => 42,
    );
    expect(out).toBe(42);
    expect(recorded).toEqual([42]); // estimate saw the result
  });

  it("re-throws the original error but still runs the estimator (record-on-throw)", async () => {
    const l = makeLimiter(passing);
    let estimatedWith: unknown = "not-called";
    await expect(
      l.withUsage(
        {
          userId: "u1",
          feature: "test",
          model: "cached",
          estimateTokens: (r) => {
            estimatedWith = r;
            return 0;
          },
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(estimatedWith).toBeUndefined(); // result undefined on throw, but estimator ran
  });
});
