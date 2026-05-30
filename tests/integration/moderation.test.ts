/**
 * Integration tests for moderation flow.
 *
 *   - flagEntity hides the review immediately (fail-safe) + dedupes.
 *   - resolveFlag "keep" restores; "remove" hides; "ban" hides all by author.
 *
 * Skipped if DATABASE_URL is unset.
 */

import { flagEntity, getPendingFlags, resolveFlag } from "@/lib/community/moderation";
import { getCourseReviews, submitReview } from "@/lib/community/reviews";
import { db } from "@/lib/db";
import { courses, moderationFlags, professorReviews, professors, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const COURSE = "TEST 903";
const AUTHOR = "mod-int-author";
const FLAGGER = "mod-int-flagger";
const ADMIN = "mod-int-admin";

async function makeReview(comment: string): Promise<string> {
  const { id } = await submitReview({
    userId: AUTHOR,
    courseCode: COURSE,
    professorName: "Mod Test Prof",
    rating: 4,
    comment,
    isAnonymous: true,
  });
  return id;
}

describe.skipIf(!HAS_DB)("moderation flow", () => {
  beforeAll(async () => {
    await db
      .insert(courses)
      .values({ code: COURSE, title: "Mod test", credits: 3 })
      .onConflictDoNothing();
    for (const id of [AUTHOR, FLAGGER, ADMIN]) {
      await db
        .insert(users)
        .values({
          id,
          email: `${id}@compass-test.local`,
          name: id,
          emailVerified: true,
          role: "user",
        })
        .onConflictDoNothing();
    }
  });

  afterAll(async () => {
    const reviewIds = (
      await db
        .select({ id: professorReviews.id })
        .from(professorReviews)
        .where(eq(professorReviews.courseCode, COURSE))
    ).map((r) => r.id);
    if (reviewIds.length) {
      await db.delete(moderationFlags).where(inArray(moderationFlags.entityId, reviewIds));
    }
    await db.delete(professorReviews).where(eq(professorReviews.courseCode, COURSE));
    await db.delete(courses).where(eq(courses.code, COURSE));
    await db.delete(users).where(inArray(users.id, [AUTHOR, FLAGGER, ADMIN]));
    await db.delete(professors).where(eq(professors.name, "Mod Test Prof"));
  });

  it("flagging a review hides it from public listing immediately", async () => {
    const reviewId = await makeReview("This review will be flagged for testing the hide flow.");
    let summary = await getCourseReviews(COURSE);
    expect(summary.reviews.some((r) => r.id === reviewId)).toBe(true);

    const result = await flagEntity({
      reporterId: FLAGGER,
      entityType: "professor_review",
      entityId: reviewId,
      reason: "spam",
    });
    expect(result.flagged).toBe(true);

    summary = await getCourseReviews(COURSE);
    expect(summary.reviews.some((r) => r.id === reviewId)).toBe(false);
  });

  it("dedupes a second flag from the same user on the same entity", async () => {
    const [flag] = await getPendingFlags();
    expect(flag).toBeDefined();
    if (!flag) return;
    const second = await flagEntity({
      reporterId: FLAGGER,
      entityType: "professor_review",
      entityId: flag.entityId,
      reason: "spam again",
    });
    expect(second.flagged).toBe(false);
  });

  it("resolving with 'keep' restores the review to public", async () => {
    const [flag] = await getPendingFlags();
    expect(flag).toBeDefined();
    if (!flag) return;
    const reviewId = flag.entityId;

    const res = await resolveFlag(flag.flagId, "keep", ADMIN);
    expect(res.resolved).toBe(true);

    const summary = await getCourseReviews(COURSE);
    expect(summary.reviews.some((r) => r.id === reviewId)).toBe(true);
    // No more pending flags.
    expect(await getPendingFlags()).toHaveLength(0);
  });

  it("resolving with 'remove' hides just that review", async () => {
    const reviewId = await makeReview("A second review that we will flag and remove permanently.");
    await flagEntity({
      reporterId: FLAGGER,
      entityType: "professor_review",
      entityId: reviewId,
      reason: "offensive",
    });
    const [flag] = await getPendingFlags();
    if (!flag) throw new Error("expected a pending flag");

    await resolveFlag(flag.flagId, "remove", ADMIN);
    const summary = await getCourseReviews(COURSE);
    expect(summary.reviews.some((r) => r.id === reviewId)).toBe(false);
  });

  it("resolving with 'ban' hides ALL reviews by the offending author", async () => {
    // Author has at least one currently-active review (the kept one). Add another.
    await makeReview("Yet another review by the same author for the ban test scenario.");
    let summary = await getCourseReviews(COURSE);
    const authorReviewsBefore = summary.reviews.length;
    expect(authorReviewsBefore).toBeGreaterThan(0);

    // Flag one of them.
    const target = summary.reviews[0];
    if (!target) throw new Error("expected an active review");
    await flagEntity({
      reporterId: FLAGGER,
      entityType: "professor_review",
      entityId: target.id,
      reason: "ban this author",
    });
    const [flag] = await getPendingFlags();
    if (!flag) throw new Error("expected a pending flag");

    await resolveFlag(flag.flagId, "ban", ADMIN);

    summary = await getCourseReviews(COURSE);
    // Every review by AUTHOR is now hidden.
    expect(summary.reviews).toHaveLength(0);
  });
});
