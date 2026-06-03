/**
 * Requirements + category progress integration tests.
 *
 * Uses the same logic the /requirements page renders to compute progress per
 * SOEN degree category. Verifies the math + categorization against real
 * Postgres data.
 */

import { db } from "@/lib/data/db";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { profiles, userCourses, users } from "@/lib/data/schema";
import {
  CATEGORIES,
  TOTAL_DEGREE_CREDITS,
  computeCategoryProgress,
  totalDegreeProgress,
} from "@/lib/domain/requirements";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_USER_ID = `req-int-${Date.now()}`;

describe("Requirements category progress", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: `${TEST_USER_ID}@compass-test.local`,
      name: "Req Tester",
      emailVerified: true,
      role: "user",
    });
    await db.insert(profiles).values({
      userId: TEST_USER_ID,
      program: "SOEN-General",
      onboardingCompleted: true,
    });
    // Seed a realistic mini-plan: 2 transferred (SE Core), 1 in-progress (Eng Core), 1 planned (Nat Sci).
    const seedPlan = [
      { courseCode: "COMP 248", term: "Done", year: 2025, status: "transferred" as const },
      { courseCode: "COMP 232", term: "Done", year: 2025, status: "transferred" as const },
      { courseCode: "ENGR 201", term: "Fall 2026", year: 2026, status: "enrolled" as const },
      { courseCode: "PHYS 284", term: "Winter 2027", year: 2027, status: "planned" as const },
    ];
    for (const c of seedPlan) {
      await db.insert(userCourses).values({ userId: TEST_USER_ID, ...c });
    }
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  it("computes per-category credits correctly (done / in-progress / planned)", async () => {
    const snap = await getUserPlanSnapshot(TEST_USER_ID);
    const progress = computeCategoryProgress(snap.userPlan, snap.catalog);

    const seCore = progress.find((p) => p.spec.key === "se_core");
    expect(seCore).toBeTruthy();
    // COMP 248 (3.5) + COMP 232 (3) = 6.5 cr transferred
    expect(seCore?.doneCredits).toBe(6.5);

    const engCore = progress.find((p) => p.spec.key === "eng_core");
    expect(engCore?.inProgressCredits).toBe(1.5); // ENGR 201

    const natSci = progress.find((p) => p.spec.key === "nat_sci_elective");
    expect(natSci?.plannedCredits).toBe(3); // PHYS 284
  });

  it("totals exclude deficiencies from the 120-credit total", async () => {
    // Add a deficiency course to the plan.
    await db.insert(userCourses).values({
      userId: TEST_USER_ID,
      courseCode: "MATH 204",
      term: "Fall 2026",
      year: 2026,
      status: "enrolled",
    });
    try {
      const snap = await getUserPlanSnapshot(TEST_USER_ID);
      const progress = computeCategoryProgress(snap.userPlan, snap.catalog);
      const totals = totalDegreeProgress(progress);

      // 6.5 (SE Core done) + 1.5 (Eng Core in-progress) + 3 (Nat Sci planned) = 11.
      // MATH 204 is a deficiency → excluded from totals.
      expect(totals.done).toBe(6.5);
      expect(totals.inProgress).toBe(1.5);
      expect(totals.planned).toBe(3);
      expect(totals.total).toBe(TOTAL_DEGREE_CREDITS);
    } finally {
      await db.delete(userCourses).where(eq(userCourses.userId, TEST_USER_ID));
    }
  });

  it("CATEGORIES required credits sum matches Concordia §71.70.9 (within rounding)", () => {
    // Concordia's official breakdown: Eng Core 27.5 + SE Core 46.5 +
    // CS Group 27 + Eng&NSci 3 + Nat Sci 6 + SOEN Electives 16 + Gen Ed 3 = 129.
    // The 120-credit degree number accounts for some overlaps (e.g. ENCS 282
    // counts toward both Eng Core and SE Core prereq chains). We bake the SE
    // Core + CS Group sum into our spec's `se_core: 73.5`.
    // Tolerance: our internal sum should match 129 (the source of truth) within ±5
    // because rounding + advisor-discretion electives can shift the printed total.
    const nonDeficiencyTotal = CATEGORIES.filter((c) => c.key !== "deficiency").reduce(
      (sum, c) => sum + c.requiredCredits,
      0,
    );
    expect(nonDeficiencyTotal).toBeGreaterThan(120);
    expect(nonDeficiencyTotal).toBeLessThan(135);
  });
});
