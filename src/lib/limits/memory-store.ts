/**
 * In-memory LimitStore backed by lru-cache. Default for single-replica v1.
 * Immutable: pushHit builds a new array rather than mutating the cached one.
 */

import { LRUCache } from "lru-cache";
import type { LimitStore } from "./store";

export class MemoryLimitStore implements LimitStore {
  private cache: LRUCache<string, number[]>;

  constructor() {
    this.cache = new LRUCache<string, number[]>({
      max: 50_000,
      ttl: 1000 * 60 * 60 * 24 * 2, // 2 days — covers all daily windows with margin
    });
  }

  getHits(key: string): readonly number[] {
    return this.cache.get(key) ?? [];
  }

  pushHit(key: string, now: number, ttlMs: number): readonly number[] {
    const hits = [...(this.cache.get(key) ?? []), now];
    this.cache.set(key, hits, { ttl: ttlMs });
    return hits;
  }

  reset(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}
