import {
  WORKLOAD_THRESHOLDS,
  calculateTermWorkload,
  estimateCourseHours,
  workloadColor,
  workloadDescription,
} from "@/lib/domain/workload";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { describe, expect, it } from "vitest";

const CATALOG = new Map<string, CourseCatalogEntry>([
  ["A", { code: "A", title: "A", credits: 3 }],
  ["B", { code: "B", title: "B", credits: 4 }],
  ["C", { code: "C", title: "C", credits: 3, avgHoursPerWeek: 18 }],
  ["D", { code: "D", title: "D", credits: 4, avgHoursPerWeek: 22 }],
]);

describe("estimateCourseHours", () => {
  it("uses avgHoursPerWeek when present", () => {
    expect(estimateCourseHours(CATALOG.get("C") as CourseCatalogEntry)).toBe(18);
    expect(estimateCourseHours(CATALOG.get("D") as CourseCatalogEntry)).toBe(22);
  });

  it("falls back to credits × 2.5 heuristic", () => {
    expect(estimateCourseHours(CATALOG.get("A") as CourseCatalogEntry)).toBe(7.5);
    expect(estimateCourseHours(CATALOG.get("B") as CourseCatalogEntry)).toBe(10);
  });
});

describe("calculateTermWorkload — buckets", () => {
  const make = (codes: string[]): PlannedCourse[] =>
    codes.map((code) => ({ courseCode: code, term: "Fall 2026", status: "planned" }));

  it("empty term → light", () => {
    const w = calculateTermWorkload([], CATALOG);
    expect(w.level).toBe("light");
    expect(w.hoursPerWeek).toBe(0);
    expect(w.credits).toBe(0);
    expect(w.courseCount).toBe(0);
  });

  it("two heuristic courses under threshold → light", () => {
    const w = calculateTermWorkload(make(["A", "B"]), CATALOG);
    expect(w.hoursPerWeek).toBe(18); // 7.5 + 10 = 17.5 → rounded
    expect(w.level).toBe("light");
    expect(w.credits).toBe(7);
    expect(w.courseCount).toBe(2);
  });

  it("two community-rated heavy courses → moderate", () => {
    const w = calculateTermWorkload(make(["C", "D"]), CATALOG);
    expect(w.hoursPerWeek).toBe(40); // 18 + 22 = 40
    expect(w.level).toBe("moderate");
  });

  it("heavy threshold boundary (≥ 45 → heavy)", () => {
    // 3 community-rated × ~18 hrs ≈ 54 hrs
    const catalog = new Map(CATALOG);
    catalog.set("E", { code: "E", title: "E", credits: 3, avgHoursPerWeek: 14 });
    const w = calculateTermWorkload(make(["C", "D", "E"]), catalog);
    expect(w.level).toBe("heavy");
    expect(w.hoursPerWeek).toBeGreaterThanOrEqual(WORKLOAD_THRESHOLDS.moderate);
  });

  it("burnout threshold (≥ 60)", () => {
    const catalog = new Map(CATALOG);
    catalog.set("F", { code: "F", title: "F", credits: 6, avgHoursPerWeek: 30 });
    catalog.set("G", { code: "G", title: "G", credits: 6, avgHoursPerWeek: 35 });
    const w = calculateTermWorkload(make(["F", "G"]), catalog);
    expect(w.level).toBe("burnout");
    expect(w.hoursPerWeek).toBeGreaterThanOrEqual(WORKLOAD_THRESHOLDS.heavy);
  });

  it("ignores dropped / DISC / failed", () => {
    const courses: PlannedCourse[] = [
      { courseCode: "C", term: "Fall 2026", status: "planned" }, // 18
      { courseCode: "D", term: "Fall 2026", status: "dropped" }, // skipped
    ];
    const w = calculateTermWorkload(courses, CATALOG);
    expect(w.hoursPerWeek).toBe(18);
    expect(w.courseCount).toBe(1);
  });
});

describe("workload helpers", () => {
  it("workloadColor maps to token names", () => {
    expect(workloadColor("light")).toBe("success");
    expect(workloadColor("moderate")).toBe("accent");
    expect(workloadColor("heavy")).toBe("warning");
    expect(workloadColor("burnout")).toBe("danger");
  });

  it("workloadDescription returns non-empty strings", () => {
    for (const level of ["light", "moderate", "heavy", "burnout"] as const) {
      expect(workloadDescription(level).length).toBeGreaterThan(10);
    }
  });
});
