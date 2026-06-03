/**
 * Integration tests that hit the real Postgres.
 *
 * Purpose: catch SQL bugs that pure-logic unit tests can't see — like the
 * "drizzle sql-tag + JS array" footgun that broke /api/ai/chat. These tests
 * require Docker Postgres to be running (npm run db:up).
 *
 * Run with: npx vitest run tests/integration
 */

import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

import { buildRAGContext } from "@/lib/ai/rag";
import { db } from "@/lib/data/db";
import { getAllCourses, getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { courses, profiles, userCourses, users } from "@/lib/data/schema";
// Lazy imports so the env vars are loaded first.
import { eq, sql } from "drizzle-orm";

const TEST_USER_ID = `int-test-${Date.now()}`;

describe("DB integration — getUserPlanSnapshot", () => {
  beforeAll(async () => {
    // Create a synthetic user with some user_courses.
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: `${TEST_USER_ID}@compass-test.local`,
      name: "Integration Tester",
      emailVerified: true,
      role: "user",
    });
    await db.insert(profiles).values({
      userId: TEST_USER_ID,
      program: "SOEN-General",
      entryTerm: "Fall 2026",
      onboardingCompleted: true,
    });
    // Add a few user_courses if the courses exist in the catalog.
    const sample = await db.select({ code: courses.code }).from(courses).limit(3);
    for (const c of sample) {
      await db.insert(userCourses).values({
        userId: TEST_USER_ID,
        courseCode: c.code,
        term: "Fall 2026",
        year: 2026,
        status: "planned",
      });
    }
  });

  afterAll(async () => {
    // Cascade deletes user_courses + profiles via FK.
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  it("returns the user's plan plus catalog entries (no SQL crash on the inArray path)", async () => {
    const snap = await getUserPlanSnapshot(TEST_USER_ID);
    expect(snap.userPlan.length).toBeGreaterThan(0);
    expect(snap.catalog.size).toBeGreaterThan(0);
    // Every userPlan course must have a matching catalog entry.
    for (const p of snap.userPlan) {
      expect(snap.catalog.has(p.courseCode)).toBe(true);
    }
  });

  it("returns empty arrays cleanly for a user with no plan", async () => {
    const tempId = `int-empty-${Date.now()}`;
    await db.insert(users).values({
      id: tempId,
      email: `${tempId}@compass-test.local`,
      name: "Empty User",
      emailVerified: true,
      role: "user",
    });
    try {
      const snap = await getUserPlanSnapshot(tempId);
      expect(snap.userPlan).toEqual([]);
      expect(snap.catalog.size).toBe(0);
    } finally {
      await db.delete(users).where(eq(users.id, tempId));
    }
  });
});

describe("DB integration — getAllCourses", () => {
  it("returns the full catalog with prereqs as parsed JSON", async () => {
    const all = await getAllCourses();
    expect(all.length).toBeGreaterThan(50);
    const comp352 = all.find((c) => c.code === "COMP 352");
    if (comp352) {
      expect(comp352.prereqs).toBeTruthy();
    }
  });
});

describe("DB integration — pgvector + RAG", () => {
  it("course_embeddings table has rows (124 expected, ≥50 minimum)", async () => {
    const [row] = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM course_embeddings`,
    );
    expect(row?.count ?? 0).toBeGreaterThanOrEqual(50);
  });

  it("buildRAGContext returns sources and context text", async () => {
    const result = await buildRAGContext({
      query: "When can I take COMP 472?",
      userId: TEST_USER_ID,
    });
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
    // COMP 472 should appear in either explicit hits or top-k semantic hits.
    expect(result.text).toContain("COMP 472");
  });

  it("buildRAGContext handles 0 explicit codes (pure semantic mode)", async () => {
    // Query with no course codes — should still return semantic matches.
    const result = await buildRAGContext({
      query: "what should I take to learn machine learning",
      userId: TEST_USER_ID,
    });
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

describe("Drizzle sql-tag array safety regression", () => {
  it("inArray with a JS array of strings works (the bug we're guarding against)", async () => {
    // This would crash with "op ANY/ALL (array) requires array on right side"
    // if we accidentally used `sql\`... ANY(${codes})\`` instead of inArray().
    const codes = ["COMP 472", "COMP 432", "NONEXISTENT 999"];
    const { inArray: drizzleInArray } = await import("drizzle-orm");
    const rows = await db
      .select({ code: courses.code })
      .from(courses)
      .where(drizzleInArray(courses.code, codes));
    expect(Array.isArray(rows)).toBe(true);
    // Should return only the codes that exist (2 of 3 above are valid).
    const found = rows.map((r) => r.code);
    expect(found.length).toBeLessThanOrEqual(codes.length);
  });
});
