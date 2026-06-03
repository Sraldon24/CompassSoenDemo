/**
 * Statistical workload predictor (no LLM).
 *
 * Uses per-course `avgHoursPerWeek` when known; falls back to a credit→hours
 * heuristic (credits × 2.5) for courses without community data.
 *
 * Returns a single category for the term that the UI renders as a pill on the
 * term header.
 */

import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";

export type WorkloadLevel = "light" | "moderate" | "heavy" | "burnout";

export interface TermWorkload {
  hoursPerWeek: number;
  level: WorkloadLevel;
  credits: number;
  courseCount: number;
}

const HEURISTIC_HOURS_PER_CREDIT = 2.5;

/** Bucket thresholds — picked to feel right for SOEN students. Tunable. */
const THRESHOLDS = {
  light: 30,
  moderate: 45,
  heavy: 60,
} as const;

export function estimateCourseHours(entry: CourseCatalogEntry): number {
  if (entry.avgHoursPerWeek && entry.avgHoursPerWeek > 0) {
    return entry.avgHoursPerWeek;
  }
  return entry.credits * HEURISTIC_HOURS_PER_CREDIT;
}

export function calculateTermWorkload(
  termCourses: PlannedCourse[],
  catalog: Map<string, CourseCatalogEntry>,
): TermWorkload {
  let hours = 0;
  let credits = 0;
  let count = 0;
  for (const c of termCourses) {
    if (c.status === "dropped" || c.status === "disc" || c.status === "failed") continue;
    const entry = catalog.get(c.courseCode);
    if (!entry) continue;
    hours += estimateCourseHours(entry);
    credits += entry.credits;
    count += 1;
  }

  let level: WorkloadLevel;
  if (hours < THRESHOLDS.light) level = "light";
  else if (hours < THRESHOLDS.moderate) level = "moderate";
  else if (hours < THRESHOLDS.heavy) level = "heavy";
  else level = "burnout";

  return { hoursPerWeek: Math.round(hours), level, credits, courseCount: count };
}

/** Workload level → Tailwind / token utility name (for badges/pills). */
export function workloadColor(level: WorkloadLevel): string {
  switch (level) {
    case "light":
      return "success";
    case "moderate":
      return "accent";
    case "heavy":
      return "warning";
    case "burnout":
      return "danger";
  }
}

/** Workload level → user-friendly copy. */
export function workloadDescription(level: WorkloadLevel): string {
  switch (level) {
    case "light":
      return "Light load — comfortable pace.";
    case "moderate":
      return "Moderate — typical full-time semester.";
    case "heavy":
      return "Heavy load — expect tight weeks.";
    case "burnout":
      return "Burnout risk — consider dropping or shifting a course.";
  }
}

interface CalculateTermWorkloadInput {
  termCourses: PlannedCourse[];
  catalog: Map<string, CourseCatalogEntry>;
}

/** Same calc, named for callers that prefer a single-arg object. */
export function calculateWorkload(input: CalculateTermWorkloadInput): TermWorkload {
  return calculateTermWorkload(input.termCourses, input.catalog);
}

interface InternalThresholds {
  light: number;
  moderate: number;
  heavy: number;
}

/** Exported for tests to assert the boundaries explicitly. */
export const WORKLOAD_THRESHOLDS: InternalThresholds = { ...THRESHOLDS };
