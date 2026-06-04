/**
 * Limits facade — default wiring + ergonomic bound exports.
 *
 * App code imports `guardAiCall` / `withUsage` from here. The store is the
 * in-memory adapter (ADR-011); the quota source wraps `@/lib/ai/groq-quota`.
 */

import { _resetGroqQuotaForTesting, checkQuota } from "@/lib/ai/groq-quota";
import { apiError } from "@/lib/api/response";
import { LIMITS } from "./config";
import { type GuardDecision, Limiter, type QuotaSource, type WithUsageOptions } from "./limiter";
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
    return apiError(
      `Daily AI quota nearly exhausted${d.quota?.reason ? ` (${d.quota.reason})` : ""}.`,
      503,
    );
  }
  return apiError("Rate limit reached. Try again later.", 429, {
    headers: { "Retry-After": String(Math.ceil(d.retryAfterMs / 1000)) },
  });
}

/**
 * Run an AI generation under usage accounting, mapping a throw to the standard
 * 503 envelope. Collapses the `withUsage(...) + try/catch → 503` frame the
 * non-streaming /ai/* routes (recommend, review, draft-email) each repeated.
 * Returns the result on success, or a Response the route should return as-is.
 *
 * `errorLabel` is the user-facing 503 message ("Recommendation failed", etc.);
 * the underlying error is still logged.
 */
export async function runAiUsage<T>(
  opts: WithUsageOptions<T>,
  errorLabel: string,
  work: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  try {
    const data = await withUsage(opts, work);
    return { ok: true, data };
  } catch (err) {
    // Log the real error server-side; return ONLY the safe static label to the
    // client (never err.message — it can leak DB/internal details).
    console.error(`[ai] ${opts.feature} failed:`, err);
    return { ok: false, response: apiError(errorLabel, 503) };
  }
}
