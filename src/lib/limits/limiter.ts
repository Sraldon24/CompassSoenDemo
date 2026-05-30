/**
 * Limiter — unifies per-user/IP rate limiting + the system-wide Groq quota
 * circuit breaker behind one `guardAiCall`, and guarantees usage is recorded
 * (even on throw) via `withUsage`.
 *
 * The per-user window goes through an injectable {@link LimitStore} (memory now,
 * Redis later per ADR-011). The system quota goes through a {@link QuotaSource}
 * adapter over `@/lib/ai/groq-quota`. The durable per-user DB ledger
 * (`recordAIUsage` → `aiUsage`) stays a separate layer — this facade orchestrates
 * it but does not merge it.
 */

import type { QuotaCheck } from "@/lib/ai/groq-quota";
import type { GroqModel } from "@/lib/ai/types";
import { recordAIUsage } from "@/lib/ai/usage";
import { LIMITS } from "./config";
import type { LimitStore } from "./store";

export type Feature = keyof typeof LIMITS;
export type Identity = { kind: "user" | "ip"; id: string };

export interface QuotaSource {
  check(model: GroqModel): QuotaCheck;
  reset(): void;
}

export interface GuardDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterMs: number;
  /** System circuit-breaker state (AI features only). */
  quota?: QuotaCheck;
  denyReason?: "rate-limit" | "quota";
}

export interface WithUsageOptions<T> {
  userId: string;
  feature: string;
  model: GroqModel | "cached";
  /** Estimate tokens from the result (undefined when the call threw). */
  estimateTokens: (result?: T) => number;
}

export class Limiter {
  constructor(
    private store: LimitStore,
    private quota: QuotaSource,
    private now: () => number = () => Date.now(),
  ) {}

  /** Per-user/IP window + (for AI features) the system quota breaker, in one call. */
  guardAiCall(opts: { feature: Feature; identity: Identity; model?: GroqModel }): GuardDecision {
    const { limit, windowMs } = LIMITS[opts.feature];
    const key = `${opts.feature}:${opts.identity.kind}:${opts.identity.id}`;
    const now = this.now();
    const hits = this.store.getHits(key).filter((t) => now - t < windowMs);

    if (hits.length >= limit) {
      const oldest = hits[0] ?? now;
      return {
        allowed: false,
        denyReason: "rate-limit",
        remaining: 0,
        limit,
        retryAfterMs: Math.max(0, windowMs - (now - oldest)),
      };
    }

    if (opts.model) {
      const q = this.quota.check(opts.model);
      if (q.shouldThrottle) {
        return {
          allowed: false,
          denyReason: "quota",
          remaining: limit - hits.length,
          limit,
          retryAfterMs: 0,
          quota: q,
        };
      }
    }

    const next = this.store.pushHit(key, now, windowMs * 2);
    return { allowed: true, remaining: Math.max(0, limit - next.length), limit, retryAfterMs: 0 };
  }

  /**
   * Run `work`, recording the `aiUsage` audit row on BOTH success and throw
   * (in a `finally`), then re-throw any error. The record itself is guarded so
   * a DB hiccup can't mask the real error.
   */
  async withUsage<T>(opts: WithUsageOptions<T>, work: () => Promise<T>): Promise<T> {
    let result: T | undefined;
    try {
      result = await work();
      return result;
    } finally {
      await recordAIUsage({
        userId: opts.userId,
        feature: opts.feature,
        model: opts.model,
        tokensUsed: opts.estimateTokens(result),
      }).catch((e) => console.warn("[ai] usage record failed:", e));
    }
  }

  reset(): void {
    this.store.reset();
    this.quota.reset();
  }
}
