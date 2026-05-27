import {
  type CourseCatalogEntry,
  type PlannedCourse,
  buildPlan,
  parseTermLabel,
  termOrdinal,
  validatePlan,
} from "@/lib/validation/plan";
import { describe, expect, it } from "vitest";

// Tiny catalog shared by most tests.
const CATALOG: CourseCatalogEntry[] = [
  { code: "COMP 232", title: "Math for CS", credits: 3 },
  { code: "COMP 249", title: "OOP II", credits: 3.5 },
  {
    code: "COMP 352",
    title: "Data Structures",
    credits: 3,
    prereqs: { all: ["COMP 232", "COMP 249"] },
  },
  {
    code: "COMP 346",
    title: "Operating Systems",
    credits: 4,
    prereqs: { all: ["SOEN 228", "COMP 352"] },
  },
  { code: "SOEN 228", title: "System Hardware", credits: 4 },
  {
    code: "SOEN 341",
    title: "Software Process",
    credits: 4,
    prereqs: { all: ["COMP 352"], concurrent: ["ENCS 282"] },
  },
  { code: "ENCS 282", title: "Tech Writing", credits: 3 },
  {
    code: "BIOL 261",
    title: "Genetics",
    credits: 3,
    prereqs: { any: ["BIOL 201", "BIOL 202"] },
  },
  { code: "BIOL 202", title: "Biology II", credits: 3 },
];

function planFromList(courses: PlannedCourse[]) {
  return buildPlan(courses, CATALOG);
}

describe("parseTermLabel", () => {
  it("parses well-formed labels", () => {
    expect(parseTermLabel("Fall 2026")).toEqual({
      raw: "Fall 2026",
      season: "Fall",
      year: 2026,
    });
    expect(parseTermLabel("Winter 2027")).toEqual({
      raw: "Winter 2027",
      season: "Winter",
      year: 2027,
    });
    expect(parseTermLabel("Summer 2028")).toEqual({
      raw: "Summer 2028",
      season: "Summer",
      year: 2028,
    });
  });

  it("rejects malformed labels", () => {
    expect(parseTermLabel("Spring 2026")).toBeNull();
    expect(parseTermLabel("Fall")).toBeNull();
    expect(parseTermLabel("")).toBeNull();
  });
});

describe("termOrdinal", () => {
  it("orders terms within a year: Winter < Summer < Fall", () => {
    const w = parseTermLabel("Winter 2027");
    const s = parseTermLabel("Summer 2027");
    const f = parseTermLabel("Fall 2027");
    expect(w && s && f).toBeTruthy();
    if (!w || !s || !f) throw new Error("unreachable");
    expect(termOrdinal(w)).toBeLessThan(termOrdinal(s));
    expect(termOrdinal(s)).toBeLessThan(termOrdinal(f));
  });

  it("orders across years: Fall 2026 < Winter 2027", () => {
    const f = parseTermLabel("Fall 2026");
    const w = parseTermLabel("Winter 2027");
    if (!f || !w) throw new Error("unreachable");
    expect(termOrdinal(f)).toBeLessThan(termOrdinal(w));
  });
});

describe("validatePlan — prereqs", () => {
  it("flags a course taken before its prereq", () => {
    const plan = planFromList([
      { courseCode: "COMP 352", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 232", term: "Winter 2027", status: "planned" },
      { courseCode: "COMP 249", term: "Winter 2027", status: "planned" },
    ]);
    const issues = validatePlan(plan);
    const prereqIssues = issues.filter((i) => i.rule === "prereq_missing");
    expect(prereqIssues).toHaveLength(2); // COMP 232 + COMP 249 missing before COMP 352.
    expect(prereqIssues.every((i) => i.courseCode === "COMP 352")).toBe(true);
  });

  it("accepts a course taken AFTER its prereq", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 249", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 352", term: "Winter 2027", status: "planned" },
    ]);
    const issues = validatePlan(plan).filter(
      (i) => i.rule === "prereq_missing" && i.courseCode === "COMP 352",
    );
    expect(issues).toHaveLength(0);
  });

  it("treats `transferred` status as satisfying prereqs regardless of term", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "—", status: "transferred" },
      { courseCode: "COMP 249", term: "—", status: "transferred" },
      { courseCode: "COMP 352", term: "Winter 2027", status: "planned" },
    ]);
    const issues = validatePlan(plan).filter(
      (i) => i.rule === "prereq_missing" && i.courseCode === "COMP 352",
    );
    expect(issues).toHaveLength(0);
  });

  it("ignores prereqs from dropped / DISC / failed courses", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "Fall 2026", status: "failed" },
      { courseCode: "COMP 249", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 352", term: "Winter 2027", status: "planned" },
    ]);
    const issues = validatePlan(plan).filter(
      (i) => i.rule === "prereq_missing" && i.courseCode === "COMP 352",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("COMP 232");
  });

  it("any-of prereqs: BIOL 261 needs only one of (BIOL 201 || BIOL 202)", () => {
    const plan = planFromList([
      { courseCode: "BIOL 202", term: "Fall 2026", status: "planned" },
      { courseCode: "BIOL 261", term: "Winter 2027", status: "planned" },
    ]);
    const issues = validatePlan(plan).filter((i) => i.courseCode === "BIOL 261");
    expect(issues.filter((i) => i.rule === "prereq_missing")).toHaveLength(0);
  });

  it("concurrent prereqs (coreqs): same-term satisfies", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 249", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 352", term: "Winter 2027", status: "planned" },
      { courseCode: "ENCS 282", term: "Fall 2027", status: "planned" },
      { courseCode: "SOEN 341", term: "Fall 2027", status: "planned" },
    ]);
    const coreqIssues = validatePlan(plan).filter(
      (i) => i.courseCode === "SOEN 341" && i.rule === "coreq_missing",
    );
    expect(coreqIssues).toHaveLength(0);
  });

  it("concurrent prereqs (coreqs): later term flags as missing", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 249", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 352", term: "Winter 2027", status: "planned" },
      { courseCode: "SOEN 341", term: "Fall 2027", status: "planned" },
      { courseCode: "ENCS 282", term: "Winter 2028", status: "planned" },
    ]);
    const coreqIssues = validatePlan(plan).filter(
      (i) => i.courseCode === "SOEN 341" && i.rule === "coreq_missing",
    );
    expect(coreqIssues).toHaveLength(1);
  });
});

describe("validatePlan — load", () => {
  it("flags a term over 18 credits as overload", () => {
    const heavyTerm: PlannedCourse[] = [
      { courseCode: "COMP 232", term: "Fall 2026", status: "planned" }, // 3
      { courseCode: "COMP 249", term: "Fall 2026", status: "planned" }, // 3.5
      { courseCode: "SOEN 228", term: "Fall 2026", status: "planned" }, // 4
      { courseCode: "SOEN 341", term: "Fall 2026", status: "planned" }, // 4
      { courseCode: "COMP 346", term: "Fall 2026", status: "planned" }, // 4
      { courseCode: "ENCS 282", term: "Fall 2026", status: "planned" }, // 3
    ];
    const issues = validatePlan(planFromList(heavyTerm)).filter(
      (i) => i.rule === "credit_overload",
    );
    expect(issues).toHaveLength(1);
  });

  it("flags a Fall term under 12 credits as underload", () => {
    const lightTerm: PlannedCourse[] = [
      { courseCode: "ENCS 282", term: "Fall 2026", status: "planned" }, // 3
      { courseCode: "COMP 232", term: "Fall 2026", status: "planned" }, // 3
    ];
    const issues = validatePlan(planFromList(lightTerm)).filter(
      (i) => i.rule === "credit_underload",
    );
    expect(issues).toHaveLength(1);
  });

  it("does NOT flag Summer underload", () => {
    const summer: PlannedCourse[] = [
      { courseCode: "ENCS 282", term: "Summer 2027", status: "planned" }, // 3
    ];
    const issues = validatePlan(planFromList(summer)).filter((i) => i.rule === "credit_underload");
    expect(issues).toHaveLength(0);
  });
});

describe("validatePlan — duplicates", () => {
  it("flags a duplicate active course across terms", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "Fall 2026", status: "planned" },
      { courseCode: "COMP 232", term: "Winter 2027", status: "planned" },
    ]);
    const dups = validatePlan(plan).filter((i) => i.rule === "duplicate_course");
    expect(dups).toHaveLength(1);
  });

  it("does NOT flag a failed-then-retake as a duplicate", () => {
    const plan = planFromList([
      { courseCode: "COMP 232", term: "Fall 2026", status: "failed" },
      { courseCode: "COMP 232", term: "Winter 2027", status: "planned" },
    ]);
    const dups = validatePlan(plan).filter((i) => i.rule === "duplicate_course");
    expect(dups).toHaveLength(0);
  });
});
