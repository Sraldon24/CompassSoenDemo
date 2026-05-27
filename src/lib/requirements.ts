/**
 * Concordia BEng SOEN program — credit requirements per category.
 * Source: Concordia 2025-26 calendar §71.70.9 (general program).
 * Numbers are the user's responsibility to verify with their advisor.
 */

import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";

export interface CategorySpec {
  key:
    | "eng_core"
    | "se_core"
    | "eng_nsci_group"
    | "nat_sci_elective"
    | "soen_elective"
    | "gen_ed_humanities"
    | "deficiency";
  label: string;
  requiredCredits: number;
  description?: string;
}

export const CATEGORIES: CategorySpec[] = [
  {
    key: "eng_core",
    label: "Engineering Core",
    requiredCredits: 26.5,
    description: "ENGR + ELEC + ENCS required for all engineering students.",
  },
  {
    key: "se_core",
    label: "Software Engineering Core",
    requiredCredits: 64,
    description: "COMP + SOEN courses that make up the SOEN backbone.",
  },
  {
    key: "eng_nsci_group",
    label: "Engineering & Natural Science Group",
    requiredCredits: 3,
    description: "One course from the Eng & Nat Sci group list.",
  },
  {
    key: "nat_sci_elective",
    label: "Natural Science Electives",
    requiredCredits: 6,
    description: "Two courses (3 cr each) from the approved Nat Sci list.",
  },
  {
    key: "soen_elective",
    label: "SOEN / Technical Electives",
    requiredCredits: 16,
    description: "Choose from the SOEN technical elective list.",
  },
  {
    key: "gen_ed_humanities",
    label: "General Education / Humanities",
    requiredCredits: 3,
    description: "One general education or humanities course.",
  },
  {
    key: "deficiency",
    label: "Deficiencies (additional)",
    requiredCredits: 18,
    description: "Required add-ons. NOT counted toward the 120-credit degree.",
  },
];

export const TOTAL_DEGREE_CREDITS = 120;

export interface CategoryProgress {
  spec: CategorySpec;
  doneCredits: number;
  inProgressCredits: number;
  plannedCredits: number;
  remainingCredits: number;
  courses: Array<{
    course: PlannedCourse;
    catalog: CourseCatalogEntry | undefined;
  }>;
}

/**
 * Tally credits per category, splitting between done / in-progress / planned.
 * Excludes dropped / DISC / failed entries.
 */
export function computeCategoryProgress(
  userPlan: PlannedCourse[],
  catalog: Map<string, CourseCatalogEntry>,
): CategoryProgress[] {
  const byCategory = new Map<string, CategoryProgress>();

  for (const spec of CATEGORIES) {
    byCategory.set(spec.key, {
      spec,
      doneCredits: 0,
      inProgressCredits: 0,
      plannedCredits: 0,
      remainingCredits: spec.requiredCredits,
      courses: [],
    });
  }

  for (const p of userPlan) {
    if (p.status === "dropped" || p.status === "disc" || p.status === "failed") continue;
    const entry = catalog.get(p.courseCode);
    if (!entry) continue;
    const category = entry.category;
    if (!category) continue;
    const cp = byCategory.get(category);
    if (!cp) continue;

    if (p.status === "transferred" || p.status === "completed") {
      cp.doneCredits += entry.credits;
    } else if (p.status === "enrolled") {
      cp.inProgressCredits += entry.credits;
    } else {
      cp.plannedCredits += entry.credits;
    }
    cp.courses.push({ course: p, catalog: entry });
  }

  for (const cp of byCategory.values()) {
    cp.remainingCredits = Math.max(
      0,
      cp.spec.requiredCredits - (cp.doneCredits + cp.inProgressCredits + cp.plannedCredits),
    );
  }

  return CATEGORIES.map((s) => {
    const cp = byCategory.get(s.key);
    if (!cp) throw new Error(`unreachable: missing category progress for ${s.key}`);
    return cp;
  });
}

/** Total credits toward the 120-credit degree (excludes deficiencies). */
export function totalDegreeProgress(progress: CategoryProgress[]): {
  done: number;
  inProgress: number;
  planned: number;
  total: number;
} {
  let done = 0;
  let inProgress = 0;
  let planned = 0;
  for (const p of progress) {
    if (p.spec.key === "deficiency") continue;
    done += p.doneCredits;
    inProgress += p.inProgressCredits;
    planned += p.plannedCredits;
  }
  return { done, inProgress, planned, total: TOTAL_DEGREE_CREDITS };
}
