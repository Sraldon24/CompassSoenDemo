/**
 * Integration tests for GDPR export + soft-delete + purge.
 *
 * Skipped if DATABASE_URL is unset.
 */

import {
  DELETION_GRACE_DAYS,
  cancelAccountDeletion,
  exportUserData,
  purgeExpiredAccounts,
  scheduleAccountDeletion,
} from "@/lib/account/gdpr";
import { db } from "@/lib/data/db";
import { courses, userCourses, users } from "@/lib/data/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const USER = "gdpr-int-user";
const COURSE = "TEST 906";

describe.skipIf(!HAS_DB)("GDPR data controls", () => {
  beforeAll(async () => {
    await db
      .insert(courses)
      .values({ code: COURSE, title: "GDPR test", credits: 3 })
      .onConflictDoNothing();
    await db
      .insert(users)
      .values({
        id: USER,
        email: `${USER}@compass-test.local`,
        name: "GDPR Tester",
        emailVerified: true,
        role: "user",
      })
      .onConflictDoNothing();
    await db.insert(userCourses).values({
      userId: USER,
      courseCode: COURSE,
      term: "Fall 2025",
      year: 2025,
      status: "completed",
    });
  });

  afterAll(async () => {
    await db.delete(userCourses).where(eq(userCourses.userId, USER));
    await db.delete(users).where(inArray(users.id, [USER]));
    await db.delete(courses).where(eq(courses.code, COURSE));
  });

  it("export gathers the account + plan data", async () => {
    const data = await exportUserData(USER);
    expect(data.account?.email).toBe(`${USER}@compass-test.local`);
    expect(data.courses.length).toBeGreaterThan(0);
    expect(data.exportedAt).toBeTruthy();
  });

  it("schedule sets deletedAt and returns a purge date ~30 days out", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const result = await scheduleAccountDeletion(USER, now);
    expect(result.scheduled).toBe(true);
    expect(result.purgeAfter.slice(0, 10)).toBe("2026-07-01");

    const [u] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, USER));
    expect(u?.deletedAt).not.toBeNull();
  });

  it("cancel clears deletedAt", async () => {
    await cancelAccountDeletion(USER);
    const [u] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, USER));
    expect(u?.deletedAt).toBeNull();
  });

  it("purge does NOT remove an account still within the grace window", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    await scheduleAccountDeletion(USER, now);
    // Run purge only 1 day later — well inside the 30-day grace.
    const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await purgeExpiredAccounts(oneDayLater);
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, USER));
    expect(u).toBeDefined(); // still present
    // reset
    await cancelAccountDeletion(USER);
  });

  it("purge removes an account past the grace window (cascade wipes child rows)", async () => {
    const deletedAt = new Date("2026-01-01T00:00:00Z");
    await scheduleAccountDeletion(USER, deletedAt);
    // Run purge well past 30 days later.
    const after = new Date(deletedAt.getTime() + (DELETION_GRACE_DAYS + 5) * 24 * 60 * 60 * 1000);
    const purged = await purgeExpiredAccounts(after);
    expect(purged).toBeGreaterThanOrEqual(1);

    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, USER));
    expect(u).toBeUndefined(); // gone
    // Cascade should have wiped the user's courses too.
    const remaining = await db.select().from(userCourses).where(eq(userCourses.userId, USER));
    expect(remaining).toHaveLength(0);
  });

  it("purgeExpiredAccountsDetailed batches multiple expired accounts in one atomic delete", async () => {
    const { purgeExpiredAccountsDetailed } = await import("@/lib/account/gdpr");
    const ids = ["gdpr-batch-a", "gdpr-batch-b"];
    const deletedAt = new Date("2026-01-01T00:00:00Z");
    for (const id of ids) {
      await db
        .insert(users)
        .values({
          id,
          email: `${id}@compass-test.local`,
          name: id,
          emailVerified: true,
          role: "user",
          deletedAt,
        })
        .onConflictDoNothing();
    }
    const after = new Date(deletedAt.getTime() + (DELETION_GRACE_DAYS + 5) * 24 * 60 * 60 * 1000);
    const result = await purgeExpiredAccountsDetailed(after);
    expect(result.deletedIds).toEqual(expect.arrayContaining(ids));
    expect(result.purged).toBe(result.deletedIds.length);
    const survivors = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
    expect(survivors).toHaveLength(0);
  });
});
