/**
 * In-memory rate limiter using lru-cache.
 *
 * See ADR-011 (docs/ARCHITECTURE.md). v1 ships in-memory because we deploy a
 * single Railway replica. Swap to Redis when going multi-replica.
 */

import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, number[]>({
  max: 50_000,
  ttl: 1000 * 60 * 60 * 24 * 2, // 2 days — covers all daily-window limits with margin
});

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Milliseconds until the oldest hit ages out (≈ retry-after). */
  retryAfterMs: number;
}

export interface RateLimitOptions {
  /** Logical bucket name, e.g. "ai-chat", "ai-recommend", "search". */
  feature: string;
  /** Caller identity. Prefer userId for authed routes; ip otherwise. */
  identity: string;
  /** Max hits per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const key = `${opts.feature}:${opts.identity}`;
  const now = Date.now();
  const hits = (cache.get(key) ?? []).filter((t) => now - t < opts.windowMs);

  if (hits.length >= opts.limit) {
    const oldest = hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      limit: opts.limit,
      retryAfterMs: Math.max(0, opts.windowMs - (now - oldest)),
    };
  }

  hits.push(now);
  cache.set(key, hits);
  return {
    allowed: true,
    remaining: opts.limit - hits.length,
    limit: opts.limit,
    retryAfterMs: 0,
  };
}

/** Convenience: standard per-user daily limit. */
export function rateLimitByUserId(
  userId: string,
  feature: string,
  limit: number,
  windowMs: number = 24 * 60 * 60 * 1000,
): RateLimitResult {
  return rateLimit({ feature, identity: `u:${userId}`, limit, windowMs });
}

/** Convenience: standard per-IP limit (used for unauthed / demo flows). */
export function rateLimitByIp(
  ip: string,
  feature: string,
  limit: number,
  windowMs: number = 60 * 60 * 1000,
): RateLimitResult {
  return rateLimit({ feature, identity: `ip:${ip}`, limit, windowMs });
}

// `LIMITS` is defined once in `@/lib/limits/config` and re-exported here so the
// legacy `@/lib/ip-rate-limit` import path stays stable for callers not yet migrated
// to the `@/lib/limits` facade.
export { LIMITS } from "@/lib/limits/config";

/** Reset all buckets — only used by tests. */
export function _resetRateLimitForTesting(): void {
  cache.clear();
}
