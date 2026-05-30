/**
 * Pure aggregate-computation functions for the community layer.
 *
 * These were previously inlined as SQL `AVG(CASE ...)` inside difficulty.ts and
 * as JS reduces inside reviews.ts — tangled with DB I/O and therefore only
 * reachable through integration tests. Extracted here as pure functions over
 * plain arrays so the math is unit-testable with no database.
 *
 * The DB helpers still own the transaction + persistence; they call these to
 * decide WHAT to write. (Deep-module principle: small pure core, thin I/O shell.)
 */

export type DifficultyVoteValue = "easy" | "medium" | "hard";

const DIFFICULTY_WEIGHT: Record<DifficultyVoteValue, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export interface DifficultyAggregate {
  /** Mean of the 1-3 weights, or null when there are no votes. */
  avg: number | null;
  count: number;
}

/** Compute the difficulty average + count from a list of votes. Pure. */
export function computeDifficultyAggregate(
  votes: ReadonlyArray<DifficultyVoteValue>,
): DifficultyAggregate {
  if (votes.length === 0) return { avg: null, count: 0 };
  let sum = 0;
  for (const v of votes) sum += DIFFICULTY_WEIGHT[v];
  return { avg: sum / votes.length, count: votes.length };
}

/** Map a numeric difficulty average back to its closest bucket. */
export function difficultyBucket(avg: number | null): DifficultyVoteValue | null {
  if (avg === null) return null;
  if (avg <= 1.5) return "easy";
  if (avg <= 2.5) return "medium";
  return "hard";
}

export interface ReviewLike {
  rating: number;
  difficulty: number | null;
  wouldTakeAgain: boolean | null;
}

export interface ReviewAggregate {
  count: number;
  averageRating: number | null;
  averageDifficulty: number | null;
  /** Fraction (0-1) of answered "would take again" that are yes, or null. */
  wouldTakeAgainPct: number | null;
}

/** Compute review aggregates from a list of reviews. Pure. */
export function computeReviewAggregate(reviews: ReadonlyArray<ReviewLike>): ReviewAggregate {
  if (reviews.length === 0) {
    return { count: 0, averageRating: null, averageDifficulty: null, wouldTakeAgainPct: null };
  }
  const sumRating = reviews.reduce((s, r) => s + r.rating, 0);
  const rated = reviews.filter((r) => typeof r.difficulty === "number");
  const sumDifficulty = rated.reduce((s, r) => s + (r.difficulty ?? 0), 0);
  const answered = reviews.filter((r) => r.wouldTakeAgain !== null);
  const yes = answered.filter((r) => r.wouldTakeAgain === true).length;

  return {
    count: reviews.length,
    averageRating: sumRating / reviews.length,
    averageDifficulty: rated.length > 0 ? sumDifficulty / rated.length : null,
    wouldTakeAgainPct: answered.length > 0 ? yes / answered.length : null,
  };
}
