/**
 * Limits facade — default wiring + ergonomic bound exports.
 *
 * App code imports `guardAiCall` / `withUsage` from here. The store is the
 * in-memory adapter (ADR-011); the quota source wraps `@/lib/ai/groq-quota`.
 */

import { _resetGroqQuotaForTesting, checkQuota } from "@/lib/ai/groq-quota";
import { NextResponse } from "next/server";
import { LIMITS } from "./config";
import { type GuardDecision, Limiter, type QuotaSource } from "./limiter";
import { MemoryLimitStore } from "./memory-store";

const quotaSource: QuotaSource = {
  check: checkQuota,
  reset: _resetGroqQuotaForTesting,
};

const limiter = new Limiter(new MemoryLimitStore(), quotaSource);

export const guardAiCall = limiter.guardAiCall.bind(limiter);
export const withUsage = limiter.withUsage.bind(limiter);

/** Reset facade state (per-user store + system quota) — tests only. */
export const _resetLimitsForTesting = limiter.reset.bind(limiter);

export { LIMITS };
export type { GuardDecision, Feature, Identity } from "./limiter";

/**
 * Standard deny envelope for a blocked `guardAiCall`. Reproduces the historical
 * 429 (rate-limit) / 503 (quota) responses + `Retry-After` header.
 */
export function denyResponse(d: GuardDecision): Response {
  if (d.denyReason === "quota") {
    return NextResponse.json(
      { error: `Daily AI quota nearly exhausted${d.quota?.reason ? ` (${d.quota.reason})` : ""}.` },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "Rate limit reached. Try again later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(d.retryAfterMs / 1000)) } },
  );
}
