/**
 * Integration tests for professor reviews.
 *
 * Critical privacy invariant: an anonymous review must NEVER return the
 * author's name. We assert that explicitly.
 *
 * Skipped if DATABASE_URL is unset.
 */

import { getCourseReviews, getProfessorsForCourse, submitReview } from "@/lib/community/reviews";
import { db } from "@/lib/data/db";
import { courses, professorReviews, professors, users } from "@/lib/data/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const COURSE = "TEST 902";
const USER = "review-int-user";

describe.skipIf(!HAS_DB)("professor reviews", () => {
  beforeAll(async () => {
    await db
      .insert(courses)
      .values({ code: COURSE, title: "Review test", credits: 3 })
      .onConflictDoNothing();
    await db
      .insert(users)
      .values({
        id: USER,
        email: `${USER}@compass-test.local`,
        name: "Real Name Should Not Leak",
        emailVerified: true,
        role: "user",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(professorReviews).where(eq(professorReviews.courseCode, COURSE));
    await db.delete(courses).where(eq(courses.code, COURSE));
    await db.delete(users).where(inArray(users.id, [USER]));
    // Clean up auto-created professor rows from this test.
    await db.delete(professors).where(eq(professors.name, "Test Prof"));
  });

  it("submits a review and surfaces it in the course aggregate", async () => {
    await submitReview({
      userId: USER,
      courseCode: COURSE,
      professorName: "Test Prof",
      rating: 5,
      difficulty: 2,
      term: "Fall 2025",
      wouldTakeAgain: true,
      comment: "Genuinely one of the best courses I have taken at Concordia.",
      isAnonymous: true,
    });

    const summary = await getCourseReviews(COURSE);
    expect(summary.count).toBe(1);
    expect(summary.averageRating).toBe(5);
    expect(summary.averageDifficulty).toBe(2);
    expect(summary.wouldTakeAgainPct).toBe(1);
    expect(summary.reviews[0]?.professorName).toBe("Test Prof");
  });

  it("NEVER leaks the author's real name on an anonymous review", async () => {
    const summary = await getCourseReviews(COURSE);
    const review = summary.reviews[0];
    expect(review).toBeDefined();
    expect(review?.isAnonymous).toBe(true);
    expect(review?.authorName).toBeNull();
    // Belt-and-suspenders: serialize the whole payload and ensure the real
    // name is absent.
    expect(JSON.stringify(summary)).not.toContain("Real Name Should Not Leak");
  });

  it("reuses an existing professor row (case-insensitive) instead of duplicating", async () => {
    await submitReview({
      userId: USER,
      courseCode: COURSE,
      professorName: "test prof", // lowercase variant of "Test Prof"
      rating: 3,
      comment: "Second review for the same professor, different casing entirely.",
    });
    const profRows = await db.select().from(professors).where(eq(professors.name, "Test Prof"));
    // Only one professor row should exist for the canonical name.
    expect(profRows).toHaveLength(1);
    const names = await getProfessorsForCourse(COURSE);
    expect(names).toEqual(["Test Prof"]);
  });

  it("rejects a rating outside 1-5", async () => {
    await expect(
      submitReview({
        userId: USER,
        courseCode: COURSE,
        professorName: "Test Prof",
        rating: 6,
        comment: "This rating is invalid and should be rejected by the validator.",
      }),
    ).rejects.toThrow();
  });

  it("rejects a comment shorter than 30 chars", async () => {
    await expect(
      submitReview({
        userId: USER,
        courseCode: COURSE,
        professorName: "Test Prof",
        rating: 4,
        comment: "too short",
      }),
    ).rejects.toThrow();
  });
});
