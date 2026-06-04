/**
 * Professor-review helpers.
 *
 * Reviews are tied to a (course, professor) pair. We auto-create the
 * professor row on first review so admins don't have to seed them — the
 * Reddit summary graph (task #83) already surfaces prof names, so this
 * keeps the curation surface small.
 *
 * Anonymity:
 *   - Default is anonymous (schema default = true).
 *   - Anonymous reviews surface as "Anonymous student" with no link back
 *     to the author. The author's userId stays in the row for moderation /
 *     dedupe / self-edit, but is never returned to the UI.
 */

import { db } from "@/lib/data/db";
import { professorReviews, professors } from "@/lib/data/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { computeReviewAggregate } from "./aggregates";

export interface PublicReview {
  id: string;
  courseCode: string | null;
  professorName: string;
  rating: number;
  difficulty: number | null;
  term: string | null;
  wouldTakeAgain: boolean | null;
  comment: string | null;
  isAnonymous: boolean;
  /** Set only when isAnonymous=false. */
  authorName: string | null;
  createdAt: Date;
}

export interface ReviewSummary {
  reviews: PublicReview[];
  count: number;
  averageRating: number | null;
  averageDifficulty: number | null;
  wouldTakeAgainPct: number | null;
}

export async function getCourseReviews(courseCode: string): Promise<ReviewSummary> {
  const rows = await db
    .select({
      id: professorReviews.id,
      courseCode: professorReviews.courseCode,
      professorName: professors.name,
      rating: professorReviews.rating,
      difficulty: professorReviews.difficulty,
      term: professorReviews.term,
      wouldTakeAgain: professorReviews.wouldTakeAgain,
      comment: professorReviews.comment,
      isAnonymous: professorReviews.isAnonymous,
      createdAt: professorReviews.createdAt,
    })
    .from(professorReviews)
    .innerJoin(professors, eq(professors.id, professorReviews.professorId))
    .where(
      and(
        eq(professorReviews.courseCode, courseCode),
        eq(professorReviews.moderationStatus, "active"),
      ),
    )
    .orderBy(desc(professorReviews.createdAt));

  const reviews: PublicReview[] = rows.map((r) => ({
    id: r.id,
    courseCode: r.courseCode,
    professorName: r.professorName,
    rating: r.rating,
    difficulty: r.difficulty,
    term: r.term,
    wouldTakeAgain: r.wouldTakeAgain,
    comment: r.comment,
    isAnonymous: r.isAnonymous,
    authorName: null, // we never reveal author for now — even non-anon reviews
    createdAt: r.createdAt,
  }));

  // Aggregate math is a pure function (unit-tested in aggregates.test.ts).
  return { reviews, ...computeReviewAggregate(reviews) };
}

export interface SubmitReviewInput {
  userId: string;
  courseCode: string;
  professorName: string;
  rating: number;
  difficulty?: number | null;
  term?: string | null;
  wouldTakeAgain?: boolean | null;
  comment?: string | null;
  isAnonymous?: boolean;
}

export async function submitReview(input: SubmitReviewInput): Promise<{ id: string }> {
  if (input.rating < 1 || input.rating > 5) throw new Error("rating must be 1-5");
  if (input.difficulty !== undefined && input.difficulty !== null) {
    if (input.difficulty < 1 || input.difficulty > 5) throw new Error("difficulty must be 1-5");
  }
  const cleanedComment = input.comment?.trim() || null;
  if (cleanedComment && cleanedComment.length > 4000) throw new Error("comment too long");
  if (cleanedComment && cleanedComment.length < 30) {
    throw new Error("comment must be at least 30 characters");
  }

  return db.transaction(async (tx) => {
    // Upsert-by-name on professors. The `uq_professors_name_lower` unique index
    // (on lower(name)) makes this race-safe: INSERT … ON CONFLICT DO NOTHING,
    // then read back. Two concurrent first-reviews can no longer create
    // duplicate professor rows that would split a professor's aggregates.
    const normalizedName = input.professorName.trim();
    if (!normalizedName) throw new Error("professorName required");

    // Bare onConflictDoNothing: the professors table's only unique constraint is
    // the expression index uq_professors_name_lower (on lower(name)), so any
    // conflict here is a case-insensitive name collision. (Drizzle's `target`
    // option only accepts columns, not the lower(name) expression, so we omit it.)
    const [inserted] = await tx
      .insert(professors)
      .values({ name: normalizedName })
      .onConflictDoNothing()
      .returning({ id: professors.id });

    let professorId: string;
    if (inserted) {
      professorId = inserted.id;
    } else {
      // Conflict — the row already exists; fetch it.
      const [existing] = await tx
        .select({ id: professors.id })
        .from(professors)
        .where(sql`LOWER(${professors.name}) = LOWER(${normalizedName})`)
        .limit(1);
      if (!existing) throw new Error("failed to resolve professor row");
      professorId = existing.id;
    }

    const [reviewRow] = await tx
      .insert(professorReviews)
      .values({
        userId: input.userId,
        professorId,
        courseCode: input.courseCode,
        rating: input.rating,
        difficulty: input.difficulty ?? null,
        term: input.term ?? null,
        wouldTakeAgain: input.wouldTakeAgain ?? null,
        comment: cleanedComment,
        isAnonymous: input.isAnonymous ?? true,
      })
      .returning({ id: professorReviews.id });

    if (!reviewRow) throw new Error("failed to insert review");
    return { id: reviewRow.id };
  });
}

/** Returns the most-mentioned professor names for a course — used to seed
 * the "Pick a professor" dropdown in the review form. */
export async function getProfessorsForCourse(courseCode: string): Promise<string[]> {
  const rows = await db
    .select({ name: professors.name, count: sql<number>`COUNT(*)::int` })
    .from(professorReviews)
    .innerJoin(professors, eq(professors.id, professorReviews.professorId))
    .where(
      and(
        eq(professorReviews.courseCode, courseCode),
        eq(professorReviews.moderationStatus, "active"),
      ),
    )
    .groupBy(professors.name)
    .orderBy(asc(professors.name));
  return rows.map((r) => r.name);
}
