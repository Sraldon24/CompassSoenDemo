/**
 * The bucket math itself is tested in aggregates.test.ts. This file only
 * guards that difficulty.ts still re-exports `bucketFromAvg` for back-compat
 * after the Cluster-1 extraction (the difficulty-vote UI imports it from here).
 */

import { bucketFromAvg } from "@/lib/community/difficulty";
import { describe, expect, it } from "vitest";

describe("difficulty.bucketFromAvg re-export", () => {
  it("still resolves and delegates to the shared bucket fn", () => {
    expect(bucketFromAvg(null)).toBeNull();
    expect(bucketFromAvg(1)).toBe("easy");
    expect(bucketFromAvg(2)).toBe("medium");
    expect(bucketFromAvg(3)).toBe("hard");
  });
});
