/**
 * Integration tests for the difficulty-vote round trip.
 *
 * Each test seeds a user + course, casts votes, and asserts that the
 * denormalized aggregate on `courses.difficultyAvg` stays correct.
 *
 * Skipped if DATABASE_URL is unset.
 */

import { castDifficultyVote, getDifficultySummary } from "@/lib/community/difficulty";
import { db } from "@/lib/db";
import { courses, difficultyVotes, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_COURSE = "TEST 901";
const TEST_USERS = ["diff-int-A", "diff-int-B", "diff-int-C"];

describe.skipIf(!HAS_DB)("difficulty vote aggregate", () => {
  beforeAll(async () => {
    await db
      .insert(courses)
      .values({ code: TEST_COURSE, title: "Diff test course", credits: 3 })
      .onConflictDoNothing();
    for (const id of TEST_USERS) {
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
    await db.delete(difficultyVotes).where(eq(difficultyVotes.courseCode, TEST_COURSE));
    await db.delete(courses).where(eq(courses.code, TEST_COURSE));
    await db.delete(users).where(inArray(users.id, TEST_USERS));
  });

  it("first vote sets avg + count and exposes a bucket", async () => {
    const userA = TEST_USERS[0];
    if (!userA) throw new Error("seed bug");
    const result = await castDifficultyVote({
      userId: userA,
      courseCode: TEST_COURSE,
      vote: "easy",
    });
    expect(result.count).toBe(1);
    expect(result.avg).toBe(1);
    expect(result.bucket).toBe("easy");

    const fetched = await getDifficultySummary(TEST_COURSE);
    expect(fetched.count).toBe(1);
    expect(fetched.avg).toBe(1);
  });

  it("a second user changes the average", async () => {
    const userB = TEST_USERS[1];
    if (!userB) throw new Error("seed bug");
    const result = await castDifficultyVote({
      userId: userB,
      courseCode: TEST_COURSE,
      vote: "hard",
    });
    expect(result.count).toBe(2);
    expect(result.avg).toBe(2);
    expect(result.bucket).toBe("medium");
  });

  it("re-voting REPLACES (not appends) the user's prior answer", async () => {
    const userB = TEST_USERS[1];
    if (!userB) throw new Error("seed bug");
    // userB now switches from hard to easy. Total remains 2, avg drops to 1.
    const result = await castDifficultyVote({
      userId: userB,
      courseCode: TEST_COURSE,
      vote: "easy",
    });
    expect(result.count).toBe(2);
    expect(result.avg).toBe(1);
    expect(result.bucket).toBe("easy");
  });

  it("courses table denormalization stays in sync after each vote", async () => {
    const userC = TEST_USERS[2];
    if (!userC) throw new Error("seed bug");
    await castDifficultyVote({ userId: userC, courseCode: TEST_COURSE, vote: "medium" });
    const [row] = await db
      .select({ avg: courses.difficultyAvg, count: courses.totalDifficultyVotes })
      .from(courses)
      .where(eq(courses.code, TEST_COURSE));
    // (easy + easy + medium) / 3 = (1 + 1 + 2) / 3 ≈ 1.333
    expect(row?.count).toBe(3);
    expect(row?.avg).toBeCloseTo(4 / 3, 5);
  });
});
