/**
 * Plan repository — read access to a user's `user_courses` + the catalog they
 * reference, shaped for the planner UI.
 *
 * Wraps Drizzle behind an interface. `makePlanRepository(db)` builds an
 * instance; the default singleton `planRepo` is bound to the pooled handle.
 * Folds in the former `getUserPlanSnapshot` from `db/queries/plan.ts`.
 */

import { db } from "@/lib/data/db";
import { userCourses } from "@/lib/data/schema";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { asc, eq } from "drizzle-orm";
import { makeCourseCatalogRepository } from "./course-catalog-repo";
import type { DbHandle } from "./types";

/** Same as `PlannedCourse` but carries the DB row id so the UI can drive moves. */
export interface UserPlanRow extends PlannedCourse {
  id: string;
}

export interface UserPlanSnapshotWithIds {
  userPlan: UserPlanRow[];
  catalog: Map<string, CourseCatalogEntry>;
}

export interface PlanRepository {
  /**
   * A user's planned/enrolled/completed courses (with row ids) plus the catalog
   * entries for everything they reference.
   */
  getSnapshot(userId: string): Promise<UserPlanSnapshotWithIds>;
}

export function makePlanRepository(handle: DbHandle): PlanRepository {
  const catalog = makeCourseCatalogRepository(handle);

  return {
    async getSnapshot(userId: string): Promise<UserPlanSnapshotWithIds> {
      const userRows = await handle
        .select({
          id: userCourses.id,
          courseCode: userCourses.courseCode,
          term: userCourses.term,
          status: userCourses.status,
          isDeficiency: userCourses.isDeficiency,
        })
        .from(userCourses)
        .where(eq(userCourses.userId, userId))
        .orderBy(asc(userCourses.term), asc(userCourses.courseCode));

      const userPlan: UserPlanRow[] = userRows.map((r) => ({
        id: r.id,
        courseCode: r.courseCode,
        term: r.term ?? "",
        status: r.status,
        isDeficiency: r.isDeficiency ?? false,
      }));

      const codes = [...new Set(userPlan.map((p) => p.courseCode))];
      const entries = await catalog.findByCodes(codes);
      const catalogMap = new Map<string, CourseCatalogEntry>();
      for (const e of entries) catalogMap.set(e.code, e);

      return { userPlan, catalog: catalogMap };
    },
  };
}

export const planRepo = makePlanRepository(db);
