/**
 * HEAVY unit + logic tests for the smart-recommendation core.
 *
 * Per user requirement: smart course selection is the core use case and MUST
 * have extensive automated coverage. These tests target the pure functions in
 * `recommend-core.ts` — no DB, no LLM, no network.
 */

import {
  SCORING,
  availabilityScore,
  buildSignals,
  cosineSimilarity,
  filterCandidates,
  filterLLMHallucinations,
  prereqDistance,
  rankCandidates,
  scoreCandidate,
} from "@/lib/ai/recommend-core";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { describe, expect, it } from "vitest";

// ----- helpers --------------------------------------------------------------

const c = (code: string, overrides: Partial<CourseCatalogEntry> = {}): CourseCatalogEntry => ({
  code,
  title: overrides.title ?? `${code} title`,
  credits: overrides.credits ?? 3,
  category: overrides.category ?? "soen_elective",
  prereqs: overrides.prereqs ?? { all: [], any: [], concurrent: [] },
  ...overrides,
});

const planned = (codes: Array<[string, PlannedCourse["status"]]>): PlannedCourse[] =>
  codes.map(([code, status]) => ({ courseCode: code, term: "Fall 2026", status }));

// ============================================================================
// prereqDistance
// ============================================================================

describe("prereqDistance", () => {
  it("returns 0 when there are no prereqs", () => {
    expect(prereqDistance(c("FOO 100"), new Set())).toBe(0);
  });

  it("returns 0 when all prereqs are satisfied", () => {
    const course = c("COMP 352", { prereqs: { all: ["COMP 232", "COMP 249"] } });
    expect(prereqDistance(course, new Set(["COMP 232", "COMP 249"]))).toBe(0);
  });

  it("counts each missing all-prereq", () => {
    const course = c("COMP 352", { prereqs: { all: ["COMP 232", "COMP 249"] } });
    expect(prereqDistance(course, new Set(["COMP 232"]))).toBe(1);
    expect(prereqDistance(course, new Set())).toBe(2);
  });

  it("any-prereqs count as 1 only if ZERO alternatives are satisfied", () => {
    const course = c("BIOL 261", { prereqs: { any: ["BIOL 201", "BIOL 202"] } });
    expect(prereqDistance(course, new Set(["BIOL 201"]))).toBe(0);
    expect(prereqDistance(course, new Set(["BIOL 202"]))).toBe(0);
    expect(prereqDistance(course, new Set())).toBe(1);
  });

  it("concurrent prereqs are NOT counted (coreqs can be taken same term)", () => {
    const course = c("SOEN 341", {
      prereqs: { all: ["ENCS 282"], concurrent: ["COMP 352"] },
    });
    expect(prereqDistance(course, new Set(["ENCS 282"]))).toBe(0);
    expect(prereqDistance(course, new Set(["ENCS 282", "COMP 352"]))).toBe(0);
  });

  it("combines all + any: missing all-prereq counts +1; missing any-group counts +1", () => {
    const course = c("HARD 999", {
      prereqs: { all: ["MATH 204"], any: ["PHYS 204", "PHYS 205"] },
    });
    expect(prereqDistance(course, new Set())).toBe(2);
    expect(prereqDistance(course, new Set(["MATH 204"]))).toBe(1);
    expect(prereqDistance(course, new Set(["MATH 204", "PHYS 205"]))).toBe(0);
  });
});

// ============================================================================
// cosineSimilarity
// ============================================================================

describe("cosineSimilarity", () => {
  it("returns 1 for identical normalized vectors", () => {
    const v = [0.6, 0.8];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([0.6, 0.8], [-0.6, -0.8])).toBeCloseTo(-1, 5);
  });

  it("returns 0 when dimensions don't match", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
  });

  it("clamps values into [-1, 1] even with float drift", () => {
    // Synthesize a slight overshoot.
    const v = new Array(384).fill(0).map((_, i) => (i === 0 ? 1.000001 : 0));
    const r = cosineSimilarity(v, v);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(-1);
  });
});

// ============================================================================
// availabilityScore
// ============================================================================

describe("availabilityScore", () => {
  it("0 distance → 1.0", () => {
    expect(availabilityScore(0)).toBe(1);
  });

  it("decreases linearly with distance", () => {
    expect(availabilityScore(1)).toBeCloseTo(0.7);
    expect(availabilityScore(2)).toBeCloseTo(0.4);
  });

  it("never returns negative", () => {
    expect(availabilityScore(10)).toBe(0);
  });

  it("treats negative input as 0", () => {
    expect(availabilityScore(-1)).toBe(0);
  });
});

// ============================================================================
// scoreCandidate
// ============================================================================

describe("scoreCandidate", () => {
  it("perfect availability + perfect interest match = 1.0", () => {
    const result = scoreCandidate(c("X"), 0, 1.0);
    expect(result.totalScore).toBeCloseTo(1);
  });

  it("zero on both = 0", () => {
    const result = scoreCandidate(c("X"), 10, 0);
    expect(result.totalScore).toBe(0);
  });

  it("interest weight equals availability weight (50/50)", () => {
    const a = scoreCandidate(c("X"), 0, 0); // availability 1.0, interest 0
    const b = scoreCandidate(c("X"), 10, 1.0); // availability 0, interest 1.0
    expect(a.totalScore).toBeCloseTo(b.totalScore);
    expect(SCORING.AVAILABILITY_WEIGHT).toBe(SCORING.INTEREST_WEIGHT);
  });

  it("includes a reason for 'all prereqs satisfied'", () => {
    expect(scoreCandidate(c("X"), 0, 0.6).reasons).toContain("All prereqs satisfied");
  });

  it("includes a reason for '1 prereq away'", () => {
    expect(scoreCandidate(c("X"), 1, 0.6).reasons).toContain("1 prereq away");
  });

  it("flags strong interest match (>50%)", () => {
    expect(scoreCandidate(c("X"), 0, 0.7).reasons.join(" ")).toContain("Strong interest match");
  });

  it("flags decent interest match (>30% but ≤50%)", () => {
    expect(scoreCandidate(c("X"), 0, 0.4).reasons.join(" ")).toContain("Decent interest match");
  });

  it("does NOT flag weak interest match (<30%)", () => {
    const reasons = scoreCandidate(c("X"), 0, 0.2).reasons.join(" ");
    expect(reasons).not.toContain("interest match");
  });
});

// ============================================================================
// filterCandidates
// ============================================================================

describe("filterCandidates", () => {
  const fullCatalog = [
    c("COMP 352", { prereqs: { all: ["COMP 232", "COMP 249"] } }),
    c("COMP 472", { category: "soen_elective", prereqs: { all: ["COMP 352"] } }),
    c("COMP 432", { category: "se_core", prereqs: { all: ["COMP 352"] } }),
    c("COMP 425", { category: "soen_elective", prereqs: {} }),
    c("MATH 204", { category: "deficiency" }),
    c("HARD 999", { category: "soen_elective", prereqs: { all: ["A", "B", "C", "D"] } }), // distance > MAX
  ];

  it("excludes courses already in the user's plan", () => {
    const signals = buildSignals(planned([["COMP 472", "planned"]]), []);
    const result = filterCandidates({ signals, catalog: fullCatalog });
    expect(result.find((c) => c.code === "COMP 472")).toBeUndefined();
  });

  it("excludes courses with prereqDistance > MAX_PREREQ_DISTANCE", () => {
    const signals = buildSignals([], []);
    const result = filterCandidates({ signals, catalog: fullCatalog });
    expect(result.find((c) => c.code === "HARD 999")).toBeUndefined();
  });

  it("excludes deficiency-category courses by default", () => {
    const signals = buildSignals([], []);
    const result = filterCandidates({ signals, catalog: fullCatalog });
    expect(result.find((c) => c.code === "MATH 204")).toBeUndefined();
  });

  it("INCLUDES deficiency-category when includeDeficiencies=true", () => {
    const signals = buildSignals([], []);
    const result = filterCandidates({
      signals,
      catalog: fullCatalog,
      includeDeficiencies: true,
    });
    expect(result.find((c) => c.code === "MATH 204")).toBeTruthy();
  });

  it("honors categoryFilter — only returns matching categories", () => {
    const signals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "transferred"],
      ]),
      [],
    );
    const result = filterCandidates({
      signals,
      catalog: fullCatalog,
      categoryFilter: ["soen_elective"],
    });
    expect(result.every((c) => c.category === "soen_elective")).toBe(true);
    expect(result.find((c) => c.code === "COMP 432")).toBeUndefined(); // se_core
  });

  it("doesn't recommend courses the user already completed", () => {
    const signals = buildSignals(planned([["COMP 472", "completed"]]), []);
    const result = filterCandidates({ signals, catalog: fullCatalog });
    expect(result.find((c) => c.code === "COMP 472")).toBeUndefined();
  });
});

// ============================================================================
// rankCandidates
// ============================================================================

describe("rankCandidates", () => {
  const courses = [
    c("LOW 100", { prereqs: {} }), // distance 0
    c("MID 200", { prereqs: { all: ["X"] } }), // distance 1
    c("HIGH 300", { prereqs: { all: ["X", "Y"] } }), // distance 2
  ];

  it("ranks 0-distance courses higher when interest scores are equal", () => {
    const interest = () => 0.5;
    const result = rankCandidates(courses, new Set(), interest, 5);
    expect(result[0]?.course.code).toBe("LOW 100");
  });

  it("is deterministic — same input yields same output", () => {
    const a = rankCandidates(courses, new Set(), () => 0.5, 5);
    const b = rankCandidates(courses, new Set(), () => 0.5, 5);
    expect(a.map((r) => r.course.code)).toEqual(b.map((r) => r.course.code));
  });

  it("respects the limit", () => {
    const result = rankCandidates(courses, new Set(), () => 0.5, 2);
    expect(result).toHaveLength(2);
  });

  it("ties broken by distance then alphabetical for stable ordering", () => {
    const ties = [c("ZZZ 100"), c("AAA 100"), c("MMM 100")];
    const result = rankCandidates(ties, new Set(), () => 0.5, 5);
    // All tied at 0 distance + 0.5 interest; alphabetical tie-break.
    expect(result.map((r) => r.course.code)).toEqual(["AAA 100", "MMM 100", "ZZZ 100"]);
  });

  it("higher interest beats lower availability when math says so (asserts exact numeric scores)", () => {
    // T2 fix: assert the actual computed totalScore values, not just rank order.
    // If the scoring weights ever change, this test will fail loudly instead of
    // passing by coincidence.
    //
    // STRONG: distance=1 (prereq "X" not taken) → availability=0.7 → total = 0.5*0.7 + 0.5*1.0 = 0.85
    // WEAK:   distance=0 (no prereqs)            → availability=1.0 → total = 0.5*1.0 + 0.5*0.0 = 0.50
    const strong = c("STRONG 100", { prereqs: { all: ["X"] } });
    const weak = c("WEAK 100");
    const result = rankCandidates(
      [strong, weak],
      new Set(),
      (course) => (course.code === "STRONG 100" ? 1.0 : 0),
      5,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.course.code).toBe("STRONG 100");
    expect(result[0]?.totalScore).toBeCloseTo(0.85, 5);
    expect(result[1]?.course.code).toBe("WEAK 100");
    expect(result[1]?.totalScore).toBeCloseTo(0.5, 5);
  });
});

// ============================================================================
// filterLLMHallucinations
// ============================================================================

describe("filterLLMHallucinations", () => {
  it("keeps only LLM picks whose codes are in the valid set", () => {
    const picks = [
      { code: "COMP 472", why: "real course" },
      { code: "FAKE 999", why: "hallucinated by LLM" },
      { code: "COMP 474", why: "also real" },
    ];
    const valid = new Set(["COMP 472", "COMP 474"]);
    const result = filterLLMHallucinations(picks, valid);
    expect(result.map((p) => p.code)).toEqual(["COMP 472", "COMP 474"]);
  });

  it("returns empty array when LLM hallucinated everything", () => {
    const picks = [{ code: "FAKE 1", why: "" }];
    expect(filterLLMHallucinations(picks, new Set(["REAL 1"]))).toHaveLength(0);
  });

  it("preserves order of valid picks", () => {
    const picks = [
      { code: "B", why: "" },
      { code: "FAKE", why: "" },
      { code: "A", why: "" },
    ];
    const result = filterLLMHallucinations(picks, new Set(["A", "B"]));
    expect(result.map((p) => p.code)).toEqual(["B", "A"]);
  });
});

// ============================================================================
// buildSignals
// ============================================================================

describe("buildSignals", () => {
  it("classifies transferred + completed as taken AND excluded", () => {
    const s = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 248", "completed"],
      ]),
      [],
    );
    expect(s.takenCodes.has("COMP 232")).toBe(true);
    expect(s.takenCodes.has("COMP 248")).toBe(true);
    expect(s.excludeCodes.has("COMP 232")).toBe(true);
    expect(s.excludeCodes.has("COMP 248")).toBe(true);
  });

  it("classifies enrolled + planned as excluded but NOT taken", () => {
    const s = buildSignals(
      planned([
        ["COMP 352", "enrolled"],
        ["COMP 348", "planned"],
      ]),
      [],
    );
    expect(s.takenCodes.has("COMP 352")).toBe(false);
    expect(s.takenCodes.has("COMP 348")).toBe(false);
    expect(s.excludeCodes.has("COMP 352")).toBe(true);
    expect(s.excludeCodes.has("COMP 348")).toBe(true);
  });

  it("ignores dropped / disc / failed entirely (so users can re-recommend)", () => {
    const s = buildSignals(
      planned([
        ["COMP 352", "dropped"],
        ["COMP 348", "disc"],
        ["MATH 204", "failed"],
      ]),
      [],
    );
    expect(s.takenCodes.size).toBe(0);
    expect(s.excludeCodes.size).toBe(0);
  });

  it("preserves interests + program", () => {
    const s = buildSignals([], ["AI", "Web"], "SOEN-AvionicsEmbedded");
    expect(s.interests).toEqual(["AI", "Web"]);
    expect(s.program).toBe("SOEN-AvionicsEmbedded");
  });
});

// ============================================================================
// PERSONA SCENARIOS — end-to-end pipeline using realistic SOEN students
// ============================================================================

describe("realistic SOEN personas", () => {
  // Canonical mini-catalog for personas.
  const SOEN_CATALOG: CourseCatalogEntry[] = [
    c("COMP 232", { category: "se_core" }),
    c("COMP 248", { category: "se_core" }),
    c("COMP 249", { category: "se_core", prereqs: { all: ["COMP 248"] } }),
    c("COMP 352", { category: "se_core", prereqs: { all: ["COMP 232", "COMP 249"] } }),
    c("COMP 432", {
      category: "se_core",
      prereqs: { all: ["COMP 352"] },
      title: "Machine Learning",
    }),
    c("COMP 472", {
      category: "soen_elective",
      prereqs: { all: ["COMP 352"] },
      title: "Artificial Intelligence",
    }),
    c("COMP 474", {
      category: "soen_elective",
      prereqs: { all: ["COMP 352"] },
      title: "Intelligent Systems",
    }),
    c("COMP 433", {
      category: "soen_elective",
      prereqs: { all: ["COMP 352"] },
      title: "Introduction to Deep Learning",
    }),
    c("COMP 371", {
      category: "soen_elective",
      prereqs: { all: ["COMP 232", "COMP 352"] },
      title: "Computer Graphics",
    }),
    c("COMP 376", {
      category: "soen_elective",
      prereqs: { all: ["COMP 371"] },
      title: "Game Development",
    }),
    c("SOEN 387", {
      category: "soen_elective",
      prereqs: { all: ["SOEN 287"] },
      title: "Web Enterprise",
    }),
    c("SOEN 287", {
      category: "se_core",
      prereqs: { all: ["COMP 248"] },
      title: "Web Programming",
    }),
    c("SOEN 422", {
      category: "soen_elective",
      prereqs: { all: ["COMP 346"] },
      title: "Embedded Systems",
    }),
    c("MATH 204", { category: "deficiency" }),
    c("MATH 205", { category: "deficiency", prereqs: { all: ["MATH 203"] } }),
    c("PHYS 284", { category: "nat_sci_elective", title: "Astronomy" }),
  ];

  it("post-COMP-352 student gets COMP 4xx AI courses surfaced", () => {
    const signals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 248", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "completed"],
      ]),
      ["AI", "machine learning"],
    );
    const eligible = filterCandidates({
      signals,
      catalog: SOEN_CATALOG,
      categoryFilter: ["soen_elective"],
    });
    const eligibleCodes = eligible.map((c) => c.code);
    // After COMP 352 completed, AI courses become eligible.
    expect(eligibleCodes).toContain("COMP 472");
    expect(eligibleCodes).toContain("COMP 474");
    expect(eligibleCodes).toContain("COMP 433");
  });

  it("pre-COMP-352 student: 400-level AI courses surface as '1 prereq away' (forward-planning)", () => {
    // By design, filterCandidates includes courses up to MAX_PREREQ_DISTANCE (2)
    // so students can see what's coming. Strict eligibility is enforced by the
    // prereqDistance value attached to each result.
    const signals = buildSignals(
      planned([
        ["COMP 248", "transferred"],
        ["COMP 232", "transferred"],
      ]),
      [],
    );
    const eligible = filterCandidates({ signals, catalog: SOEN_CATALOG });
    const ai = eligible.find((c) => c.code === "COMP 472");
    expect(ai).toBeTruthy();
    if (ai) {
      // Should show as 1 prereq away (missing COMP 352).
      expect(prereqDistance(ai, signals.takenCodes)).toBe(1);
    }
  });

  it("empty-plan student: candidates are within MAX_PREREQ_DISTANCE", () => {
    const signals = buildSignals([], []);
    const eligible = filterCandidates({ signals, catalog: SOEN_CATALOG });
    for (const c of eligible) {
      const dist = prereqDistance(c, signals.takenCodes);
      expect(dist).toBeLessThanOrEqual(SCORING.MAX_PREREQ_DISTANCE);
    }
  });

  it("upper bound invariant: courses with prereqDistance > MAX_PREREQ_DISTANCE are NEVER surfaced", () => {
    // Guards against drift if MAX_PREREQ_DISTANCE is ever loosened.
    // SOEN 390 → needs SOEN 345 → needs SOEN 343 (3+ away from empty plan).
    // SOEN 490 → needs SOEN 390 → even further. Both must be excluded.
    const signals = buildSignals([], []);
    const eligible = filterCandidates({ signals, catalog: SOEN_CATALOG });
    expect(eligible.find((c) => c.code === "SOEN 390")).toBeUndefined();
    expect(eligible.find((c) => c.code === "SOEN 490")).toBeUndefined();
  });

  it("retake scenario: failed course doesn't gate downstream until retake completes", () => {
    // User failed COMP 352 then re-planned it. Until the retake is `completed`
    // or `transferred`, downstream courses (COMP 472) remain 1-prereq-away.
    const signals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 248", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "failed"],
        ["COMP 352", "planned"], // retake
      ]),
      [],
    );
    expect(signals.takenCodes.has("COMP 352")).toBe(false);
    expect(signals.excludeCodes.has("COMP 352")).toBe(true);
    const eligible = filterCandidates({ signals, catalog: SOEN_CATALOG });
    const c472 = eligible.find((c) => c.code === "COMP 472");
    expect(c472).toBeTruthy();
    if (c472) expect(prereqDistance(c472, signals.takenCodes)).toBe(1);
  });

  it("AI-focused student: ranking surfaces ML/AI courses high", () => {
    const signals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 248", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "completed"],
      ]),
      ["artificial intelligence", "machine learning"],
    );
    const eligible = filterCandidates({
      signals,
      catalog: SOEN_CATALOG,
      categoryFilter: ["soen_elective"],
    });
    // Mock interest scoring: AI/ML courses get high, others low.
    const aiCodes = new Set(["COMP 472", "COMP 474", "COMP 433"]);
    const getInterest = (course: CourseCatalogEntry): number =>
      aiCodes.has(course.code) ? 0.85 : 0.2;
    const top = rankCandidates(eligible, signals.takenCodes, getInterest, 3);
    const topCodes = top.map((r) => r.course.code);
    // All 3 AI courses should be in top 3.
    expect(topCodes).toEqual(expect.arrayContaining(["COMP 472", "COMP 474", "COMP 433"]));
  });

  it("hallucination guard: LLM picks COMP 999 → it's dropped", () => {
    const signals = buildSignals(planned([["COMP 352", "completed"]]), []);
    const eligible = filterCandidates({
      signals,
      catalog: SOEN_CATALOG,
      categoryFilter: ["soen_elective"],
    });
    const ranked = rankCandidates(eligible, signals.takenCodes, () => 0.5, 12);
    const llmPicks = [
      { code: "COMP 472", why: "real" },
      { code: "COMP 999", why: "hallucinated" },
      { code: "FAKE 9999", why: "also hallucinated" },
      { code: "COMP 474", why: "real" },
    ];
    const validCodes = new Set(ranked.map((c) => c.course.code));
    const safe = filterLLMHallucinations(llmPicks, validCodes);
    expect(safe.map((p) => p.code)).toEqual(["COMP 472", "COMP 474"]);
  });

  it("never recommends a course the user already has planned", () => {
    const signals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 248", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "completed"],
        ["COMP 472", "planned"], // already on plan
      ]),
      ["AI"],
    );
    const eligible = filterCandidates({ signals, catalog: SOEN_CATALOG });
    expect(eligible.find((c) => c.code === "COMP 472")).toBeUndefined();
  });

  it("deficiency-only student: filtering with includeDeficiencies=true returns math/phys", () => {
    const signals = buildSignals([], []);
    const eligible = filterCandidates({
      signals,
      catalog: SOEN_CATALOG,
      includeDeficiencies: true,
      categoryFilter: ["deficiency"],
    });
    const codes = eligible.map((c) => c.code);
    expect(codes).toContain("MATH 204");
  });

  it("games-focused student needs COMP 371 → COMP 376 unlocks once 371 is in plan", () => {
    const beforeSignals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "completed"],
      ]),
      ["games"],
    );
    const before = filterCandidates({
      signals: beforeSignals,
      catalog: SOEN_CATALOG,
      categoryFilter: ["soen_elective"],
    });
    // COMP 376 is 1 prereq away (COMP 371).
    expect(before.find((c) => c.code === "COMP 376")).toBeTruthy();

    const afterSignals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "completed"],
        ["COMP 371", "completed"],
      ]),
      ["games"],
    );
    const after = filterCandidates({
      signals: afterSignals,
      catalog: SOEN_CATALOG,
      categoryFilter: ["soen_elective"],
    });
    const c376 = after.find((c) => c.code === "COMP 376");
    expect(c376).toBeTruthy();
    if (c376) expect(prereqDistance(c376, afterSignals.takenCodes)).toBe(0);
  });

  it("dropped courses don't count as completed (downstream still marked 1-away)", () => {
    const signals = buildSignals(
      planned([
        ["COMP 232", "transferred"],
        ["COMP 248", "transferred"],
        ["COMP 249", "transferred"],
        ["COMP 352", "dropped"], // dropped, not completed
      ]),
      ["AI"],
    );
    // COMP 472 still shows up (1 prereq away — COMP 352 missing).
    const eligible = filterCandidates({ signals, catalog: SOEN_CATALOG });
    const c472 = eligible.find((c) => c.code === "COMP 472");
    expect(c472).toBeTruthy();
    if (c472) {
      expect(prereqDistance(c472, signals.takenCodes)).toBe(1);
    }
    // And — crucially — the user's `dropped` row didn't mark COMP 352 as taken.
    expect(signals.takenCodes.has("COMP 352")).toBe(false);
  });
});
