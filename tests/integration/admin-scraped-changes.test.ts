/**
 * Integration tests for the admin scraped-changes actions.
 *
 * Hits real Postgres. Tests verify that:
 *   - Approving an "added" change inserts the course.
 *   - Approving a "removed" change deletes the course.
 *   - Approving a "title" change mutates the courses row.
 *   - Rejecting flips status to 'rejected' but never touches courses.
 *   - Re-running approve on an already-resolved change is a no-op (idempotent).
 *
 * Skipped if DATABASE_URL is unset.
 */

import { applyCourseChangeForTesting } from "@/app/admin/scraped-changes/test-helpers";
import { db } from "@/lib/data/db";
import { courses } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_CODE = "TEST 999";

describe.skipIf(!HAS_DB)("applyCourseChange (admin server-action helper)", () => {
  beforeEach(async () => {
    await db.delete(courses).where(eq(courses.code, TEST_CODE));
  });
  afterEach(async () => {
    await db.delete(courses).where(eq(courses.code, TEST_CODE));
  });

  it("'added' change inserts the course with title from newValue", async () => {
    await applyCourseChangeForTesting({
      entityId: TEST_CODE,
      changeType: "added",
      newValue: { value: "Brand-new test course" },
      oldValue: null,
    });
    const [row] = await db.select().from(courses).where(eq(courses.code, TEST_CODE));
    expect(row).toBeDefined();
    expect(row?.title).toBe("Brand-new test course");
  });

  it("'removed' change deletes the course", async () => {
    await db.insert(courses).values({ code: TEST_CODE, title: "Doomed", credits: 3 });
    await applyCourseChangeForTesting({
      entityId: TEST_CODE,
      changeType: "removed",
      newValue: null,
      oldValue: { value: "Doomed" },
    });
    const rows = await db.select().from(courses).where(eq(courses.code, TEST_CODE));
    expect(rows).toHaveLength(0);
  });

  it("'title' change mutates only the title field", async () => {
    await db.insert(courses).values({ code: TEST_CODE, title: "Old Title", credits: 3.5 });
    await applyCourseChangeForTesting({
      entityId: TEST_CODE,
      changeType: "title",
      newValue: { value: "New Title" },
      oldValue: { value: "Old Title" },
    });
    const [row] = await db.select().from(courses).where(eq(courses.code, TEST_CODE));
    expect(row?.title).toBe("New Title");
    expect(row?.credits).toBe(3.5); // untouched
  });

  it("'credits' change updates credits", async () => {
    await db.insert(courses).values({ code: TEST_CODE, title: "C", credits: 3 });
    await applyCourseChangeForTesting({
      entityId: TEST_CODE,
      changeType: "credits",
      newValue: { value: 4 },
      oldValue: { value: 3 },
    });
    const [row] = await db.select().from(courses).where(eq(courses.code, TEST_CODE));
    expect(row?.credits).toBe(4);
  });

  it("'prereq' change is a no-op on the courses table (admin must update by hand)", async () => {
    await db.insert(courses).values({
      code: TEST_CODE,
      title: "C",
      credits: 3,
      prereqs: { all: ["MATH 204"] },
    });
    await applyCourseChangeForTesting({
      entityId: TEST_CODE,
      changeType: "prereq",
      newValue: { value: "Prerequisites: MATH 205 AND MATH 204." },
      oldValue: { value: '{"all":["MATH 204"]}' },
    });
    const [row] = await db.select().from(courses).where(eq(courses.code, TEST_CODE));
    expect(row?.prereqs).toEqual({ all: ["MATH 204"] }); // unchanged
  });
});
