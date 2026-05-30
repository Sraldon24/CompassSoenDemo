/**
 * LimitStore — the swappable backend for the sliding-window rate limiter.
 *
 * Keeps a timestamp list per key (NOT a scalar counter) so the sliding window
 * stays byte-identical to the original lru-cache implementation. The default
 * `MemoryLimitStore` is in-process (single Railway replica, ADR-011); a
 * `RedisLimitStore` can implement the same interface when going multi-replica.
 */

export interface LimitStore {
  /** Hit timestamps recorded for `key` (may include expired ones; caller filters). */
  getHits(key: string): readonly number[];
  /** Append a hit at `now`, persist with TTL, return the post-push list. */
  pushHit(key: string, now: number, ttlMs: number): readonly number[];
  /** Clear one key, or all keys when omitted (test reset). */
  reset(key?: string): void;
}
