/**
 * Groq quota tracker — system-wide (not per-user).
 *
 * Groq's free tier publishes hard daily caps PER MODEL:
 *   llama-3.3-70b-versatile: 1,000 RPD / 100K TPD
 *   llama-3.1-8b-instant:   14,400 RPD / 500K TPD
 *
 * Our per-user lru-cache rate limit (50/day) protects against single-user abuse
 * but does NOT prevent the *system* from hammering Groq into a 429 storm
 * (20 users × 50 = 1000 — exactly the smart-tier cap).
 *
 * This module tracks system-wide consumption in-memory and exposes:
 *   - shouldThrottle(model) — checks if we're near the cap (≥85% used)
 *   - recordUsage(model, tokens) — call after every successful response
 *   - resetIfNewDay() — called on every check, auto-resets at UTC midnight
 *
 * NOTE: Single-process in-memory tracker. Survives single-Railway-replica
 * deploys. Move to Redis when multi-replica per ADR-011.
 */

import type { GroqModel } from "./types";

interface ModelQuota {
  rpd: number; // requests/day
  tpd: number; // tokens/day
  rpm: number; // requests/min
  tpm: number; // tokens/min
}

// Authoritative numbers from https://console.groq.com/docs/rate-limits (free tier).
// Update here if Groq publishes changes — they have in the past.
export const GROQ_LIMITS: Record<GroqModel, ModelQuota> = {
  "llama-3.3-70b-versatile": { rpd: 1_000, tpd: 100_000, rpm: 30, tpm: 12_000 },
  "llama-3.1-8b-instant": { rpd: 14_400, tpd: 500_000, rpm: 30, tpm: 6_000 },
};

const THROTTLE_PCT = 0.85; // start surfacing 503s when ≥85% of daily quota used

interface ModelUsage {
  requests: number;
  tokens: number;
  resetAt: number; // UTC ms timestamp of next midnight
}

const usage: Record<GroqModel, ModelUsage> = {
  "llama-3.3-70b-versatile": { requests: 0, tokens: 0, resetAt: nextUtcMidnight() },
  "llama-3.1-8b-instant": { requests: 0, tokens: 0, resetAt: nextUtcMidnight() },
};

function nextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.getTime();
}

function resetIfNewDay(model: GroqModel): void {
  const u = usage[model];
  if (Date.now() >= u.resetAt) {
    u.requests = 0;
    u.tokens = 0;
    u.resetAt = nextUtcMidnight();
  }
}

export interface QuotaCheck {
  /** True if the caller should refuse the request (≥85% of any cap used). */
  shouldThrottle: boolean;
  /** Reason text suitable for logging or surfacing in a 503. */
  reason?: string;
  pctUsed: number;
  requestsRemaining: number;
  tokensRemaining: number;
}

export function checkQuota(model: GroqModel): QuotaCheck {
  resetIfNewDay(model);
  const limits = GROQ_LIMITS[model];
  const u = usage[model];
  const rPct = u.requests / limits.rpd;
  const tPct = u.tokens / limits.tpd;
  const pctUsed = Math.max(rPct, tPct);

  return {
    shouldThrottle: pctUsed >= THROTTLE_PCT,
    reason:
      rPct >= THROTTLE_PCT
        ? `Daily request quota ${u.requests}/${limits.rpd} used`
        : tPct >= THROTTLE_PCT
          ? `Daily token quota ${u.tokens}/${limits.tpd} used`
          : undefined,
    pctUsed,
    requestsRemaining: Math.max(0, limits.rpd - u.requests),
    tokensRemaining: Math.max(0, limits.tpd - u.tokens),
  };
}

export function recordGroqUsage(model: GroqModel, tokens: number): void {
  resetIfNewDay(model);
  usage[model].requests += 1;
  usage[model].tokens += tokens;
}

/** Test helper — reset every model's counters. */
export function _resetGroqQuotaForTesting(): void {
  for (const key of Object.keys(usage) as GroqModel[]) {
    usage[key] = { requests: 0, tokens: 0, resetAt: nextUtcMidnight() };
  }
}

/** Snapshot for /api/admin or a future debug endpoint. */
export function snapshotGroqUsage(): Record<GroqModel, ModelUsage & ModelQuota> {
  resetIfNewDay("llama-3.3-70b-versatile");
  resetIfNewDay("llama-3.1-8b-instant");
  return {
    "llama-3.3-70b-versatile": {
      ...usage["llama-3.3-70b-versatile"],
      ...GROQ_LIMITS["llama-3.3-70b-versatile"],
    },
    "llama-3.1-8b-instant": {
      ...usage["llama-3.1-8b-instant"],
      ...GROQ_LIMITS["llama-3.1-8b-instant"],
    },
  };
}
