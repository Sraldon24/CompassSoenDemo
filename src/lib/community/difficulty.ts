/**
 * Difficulty-vote query helpers.
 *
 * The schema stores votes as a 3-value enum (easy / medium / hard) on
 * `difficulty_votes` and denormalizes the aggregate onto `courses.difficultyAvg`
 * + `courses.totalDifficultyVotes`. Every write goes through `castDifficultyVote()`
 * which updates both inside a transaction so reads from the courses table
 * never lag.
 */

import { db } from "@/lib/data/db";
import { courses, difficultyVotes } from "@/lib/data/schema";
import { and, eq, sql } from "drizzle-orm";
import { type DifficultyVoteValue, difficultyBucket } from "./aggregates";

export type DifficultyVote = DifficultyVoteValue;

export interface DifficultySummary {
  /** Numeric average (1-3) or null if no votes yet. */
  avg: number | null;
  /** Total vote count for this course. */
  count: number;
  /** Closest enum bucket for the average — `null` when no votes. */
  bucket: DifficultyVote | null;
}

/** Re-export of the pure bucket fn (unit-tested in aggregates.test.ts) so
 * existing imports of `bucketFromAvg` keep working. */
export const bucketFromAvg = difficultyBucket;

export async function getDifficultySummary(courseCode: string): Promise<DifficultySummary> {
  const [row] = await db
    .select({ avg: courses.difficultyAvg, count: courses.totalDifficultyVotes })
    .from(courses)
    .where(eq(courses.code, courseCode));
  if (!row) return { avg: null, count: 0, bucket: null };
  return { avg: row.avg, count: row.count, bucket: bucketFromAvg(row.avg) };
}

export async function getUserVote(
  userId: string,
  courseCode: string,
): Promise<DifficultyVote | null> {
  const [row] = await db
    .select({ vote: difficultyVotes.vote })
    .from(difficultyVotes)
    .where(and(eq(difficultyVotes.userId, userId), eq(difficultyVotes.courseCode, courseCode)));
  return (row?.vote as DifficultyVote | undefined) ?? null;
}

export interface CastVoteInput {
  userId: string;
  courseCode: string;
  vote: DifficultyVote;
  term?: string | null;
  instructor?: string | null;
}

/**
 * Inserts or updates the user's vote, then recomputes the course's
 * difficultyAvg + totalDifficultyVotes inside the same transaction.
 *
 * We recompute from scratch (AVG over all rows) rather than running a
 * running average — cost is tiny (< 50 votes per course in practice) and
 * eliminates drift from race conditions on concurrent updates.
 */
export async function castDifficultyVote(input: CastVoteInput): Promise<DifficultySummary> {
  return db.transaction(async (tx) => {
    await tx
      .insert(difficultyVotes)
      .values({
        userId: input.userId,
        courseCode: input.courseCode,
        vote: input.vote,
        term: input.term ?? null,
        instructor: input.instructor ?? null,
      })
      .onConflictDoUpdate({
        target: [difficultyVotes.userId, difficultyVotes.courseCode],
        set: {
          vote: input.vote,
          term: input.term ?? null,
          instructor: input.instructor ?? null,
        },
      });

    // Recompute aggregate. Cast enum → numeric via CASE so we can AVG it.
    // Postgres needs an explicit ::int cast on each branch when the values
    // come from parameterized placeholders.
    const [agg] = await tx
      .select({
        avg: sql<number | null>`AVG(CASE
          WHEN ${difficultyVotes.vote} = 'easy' THEN 1::int
          WHEN ${difficultyVotes.vote} = 'medium' THEN 2::int
          WHEN ${difficultyVotes.vote} = 'hard' THEN 3::int
        END)::real`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(difficultyVotes)
      .where(eq(difficultyVotes.courseCode, input.courseCode));

    const avg = agg?.avg ?? null;
    const count = agg?.count ?? 0;

    await tx
      .update(courses)
      .set({ difficultyAvg: avg, totalDifficultyVotes: count })
      .where(eq(courses.code, input.courseCode));

    return { avg, count, bucket: bucketFromAvg(avg) };
  });
}
