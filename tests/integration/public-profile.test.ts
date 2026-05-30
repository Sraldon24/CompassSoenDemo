/**
 * Integration tests for public profiles.
 *
 * Privacy invariants:
 *   - A private profile (isPublic=false) returns null even with a valid slug.
 *   - showFuturePlan=false hides planned courses but keeps completed ones.
 *
 * Skipped if DATABASE_URL is unset.
 */

import { getPublicProfileBySlug } from "@/lib/community/public-profile";
import { db } from "@/lib/db";
import { courses, profiles, userCourses, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const USER = "pub-int-user";
const SLUG = "pub-int-tester";
const C_DONE = "TEST 904";
const C_PLAN = "TEST 905";

describe.skipIf(!HAS_DB)("public profile", () => {
  beforeAll(async () => {
    await db
      .insert(users)
      .values({
        id: USER,
        email: `${USER}@compass-test.local`,
        name: "Pub Tester",
        emailVerified: true,
        role: "user",
      })
      .onConflictDoNothing();
    await db
      .insert(courses)
      .values([
        { code: C_DONE, title: "Done course", credits: 3 },
        { code: C_PLAN, title: "Planned course", credits: 3 },
      ])
      .onConflictDoNothing();
    await db
      .insert(profiles)
      .values({
        userId: USER,
        program: "SOEN-General",
        isPublic: true,
        publicSlug: SLUG,
        showFuturePlan: true,
        onboardingCompleted: true,
      })
      .onConflictDoNothing();
    await db.insert(userCourses).values([
      { userId: USER, courseCode: C_DONE, term: "Fall 2024", year: 2024, status: "completed" },
      { userId: USER, courseCode: C_PLAN, term: "Fall 2026", year: 2026, status: "planned" },
    ]);
  });

  afterAll(async () => {
    await db.delete(userCourses).where(eq(userCourses.userId, USER));
    await db.delete(profiles).where(eq(profiles.userId, USER));
    await db.delete(users).where(inArray(users.id, [USER]));
    await db.delete(courses).where(inArray(courses.code, [C_DONE, C_PLAN]));
  });

  it("returns the profile with completed + planned when public and showFuturePlan", async () => {
    const profile = await getPublicProfileBySlug(SLUG);
    expect(profile).not.toBeNull();
    expect(profile?.displayName).toBe("Pub Tester");
    expect(profile?.creditsEarned).toBe(3);
    expect(profile?.completed.map((c) => c.code)).toContain(C_DONE);
    expect(profile?.planned.map((c) => c.code)).toContain(C_PLAN);
  });

  it("hides planned courses when showFuturePlan is false", async () => {
    await db.update(profiles).set({ showFuturePlan: false }).where(eq(profiles.userId, USER));
    const profile = await getPublicProfileBySlug(SLUG);
    expect(profile?.planned).toHaveLength(0);
    // Completed still shown.
    expect(profile?.completed.map((c) => c.code)).toContain(C_DONE);
    await db.update(profiles).set({ showFuturePlan: true }).where(eq(profiles.userId, USER));
  });

  it("returns null for a private profile even with the correct slug", async () => {
    await db.update(profiles).set({ isPublic: false }).where(eq(profiles.userId, USER));
    const profile = await getPublicProfileBySlug(SLUG);
    expect(profile).toBeNull();
    await db.update(profiles).set({ isPublic: true }).where(eq(profiles.userId, USER));
  });

  it("returns null for an unknown slug", async () => {
    expect(await getPublicProfileBySlug("definitely-not-a-real-slug-xyz")).toBeNull();
  });
});
