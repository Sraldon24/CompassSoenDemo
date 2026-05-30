/**
 * Unit tests for the pure community aggregate functions. No DB.
 * These replace the inline math that previously lived (untested) inside
 * difficulty.ts and reviews.ts.
 */

import {
  computeDifficultyAggregate,
  computeReviewAggregate,
  difficultyBucket,
} from "@/lib/community/aggregates";
import { describe, expect, it } from "vitest";

describe("computeDifficultyAggregate", () => {
  it("returns null avg + 0 count for no votes", () => {
    expect(computeDifficultyAggregate([])).toEqual({ avg: null, count: 0 });
  });

  it("weights easy=1, medium=2, hard=3", () => {
    expect(computeDifficultyAggregate(["easy"])).toEqual({ avg: 1, count: 1 });
    expect(computeDifficultyAggregate(["hard"])).toEqual({ avg: 3, count: 1 });
  });

  it("averages a mixed set", () => {
    // easy + easy + medium = (1+1+2)/3 = 1.333…
    const r = computeDifficultyAggregate(["easy", "easy", "medium"]);
    expect(r.count).toBe(3);
    expect(r.avg).toBeCloseTo(4 / 3, 5);
  });
});

describe("difficultyBucket", () => {
  it("returns null for null avg", () => {
    expect(difficultyBucket(null)).toBeNull();
  });
  it("maps boundaries: ≤1.5 easy, ≤2.5 medium, else hard", () => {
    expect(difficultyBucket(1)).toBe("easy");
    expect(difficultyBucket(1.5)).toBe("easy");
    expect(difficultyBucket(1.51)).toBe("medium");
    expect(difficultyBucket(2.5)).toBe("medium");
    expect(difficultyBucket(2.51)).toBe("hard");
    expect(difficultyBucket(3)).toBe("hard");
  });
});

describe("computeReviewAggregate", () => {
  it("returns all-null for no reviews", () => {
    expect(computeReviewAggregate([])).toEqual({
      count: 0,
      averageRating: null,
      averageDifficulty: null,
      wouldTakeAgainPct: null,
    });
  });

  it("averages rating across all reviews", () => {
    const r = computeReviewAggregate([
      { rating: 5, difficulty: null, wouldTakeAgain: null },
      { rating: 3, difficulty: null, wouldTakeAgain: null },
    ]);
    expect(r.count).toBe(2);
    expect(r.averageRating).toBe(4);
  });

  it("averages difficulty only over reviews that supplied it", () => {
    const r = computeReviewAggregate([
      { rating: 4, difficulty: 2, wouldTakeAgain: null },
      { rating: 4, difficulty: null, wouldTakeAgain: null }, // excluded from difficulty avg
      { rating: 4, difficulty: 4, wouldTakeAgain: null },
    ]);
    expect(r.averageDifficulty).toBe(3); // (2+4)/2
  });

  it("computes would-take-again % over ANSWERED reviews only", () => {
    const r = computeReviewAggregate([
      { rating: 4, difficulty: null, wouldTakeAgain: true },
      { rating: 4, difficulty: null, wouldTakeAgain: false },
      { rating: 4, difficulty: null, wouldTakeAgain: null }, // not answered → excluded
    ]);
    expect(r.wouldTakeAgainPct).toBe(0.5); // 1 yes / 2 answered
  });

  it("wouldTakeAgainPct is null when nobody answered", () => {
    const r = computeReviewAggregate([{ rating: 4, difficulty: null, wouldTakeAgain: null }]);
    expect(r.wouldTakeAgainPct).toBeNull();
  });
});
