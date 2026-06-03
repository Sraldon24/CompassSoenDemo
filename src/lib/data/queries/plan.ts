/**
 * Plan-related DB queries.
 *
 * Server Component-safe. This module is now a thin shim over the repositories
 * in `@/lib/data/repositories` (Phase 1 of the repository migration — see
 * docs/REFACTOR.md). The historical function names + import path are preserved
 * so existing consumers and `tests/integration/db-queries.test.ts` are unchanged.
 */

import { courseCatalogRepo } from "@/lib/data/repositories/course-catalog-repo";
import { planRepo } from "@/lib/data/repositories/plan-repo";
import type { UserPlanRow, UserPlanSnapshotWithIds } from "@/lib/data/repositories/plan-repo";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";

export type { UserPlanRow, UserPlanSnapshotWithIds };

/** Legacy alias — kept for back-compat with earlier consumers. */
export interface UserPlanSnapshot {
  userPlan: PlannedCourse[];
  catalog: Map<string, CourseCatalogEntry>;
}

/**
 * Fetch a user's entire planned + enrolled + completed course list, plus the
 * course catalog entries for everything they reference (with row ids).
 */
export function getUserPlanSnapshot(userId: string): Promise<UserPlanSnapshotWithIds> {
  return planRepo.getSnapshot(userId);
}

/** Get the full course catalog — used by /plan to populate the "+ Add" picker. */
export function getAllCourses(): Promise<CourseCatalogEntry[]> {
  return courseCatalogRepo.findAll();
}

// `termRange` lives in `@/lib/term` (single source of truth); re-exported here
// so the existing `@/lib/data/queries/plan` import path stays stable.
export { termRange } from "@/lib/domain/term";
