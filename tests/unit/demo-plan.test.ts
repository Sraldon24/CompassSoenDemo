/**
 * The /demo sample plan is the first thing r/Concordia visitors see — it must
 * be prerequisite-valid so the demo doesn't show embarrassing errors. These
 * tests run the real validation engine over the static demo data.
 */

import { DEMO_CATALOG, DEMO_PLAN, DEMO_TERMS } from "@/lib/demo/sample-plan";
import { buildPlan, validatePlan } from "@/lib/validation/plan";
import { describe, expect, it } from "vitest";

describe("demo sample plan", () => {
  it("has no prerequisite ERRORS (warnings/info are fine)", () => {
    const plan = buildPlan(DEMO_PLAN, DEMO_CATALOG);
    const errors = validatePlan(plan).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("references only courses that exist in the demo catalog", () => {
    const codes = new Set(DEMO_CATALOG.map((c) => c.code));
    for (const p of DEMO_PLAN) {
      expect(codes.has(p.courseCode)).toBe(true);
    }
  });

  it("uses only terms listed in DEMO_TERMS", () => {
    const terms = new Set(DEMO_TERMS);
    for (const p of DEMO_PLAN) {
      expect(terms.has(p.term)).toBe(true);
    }
  });

  it("every catalog prereq points at another catalog course", () => {
    const codes = new Set(DEMO_CATALOG.map((c) => c.code));
    for (const c of DEMO_CATALOG) {
      for (const pre of [...(c.prereqs?.all ?? []), ...(c.prereqs?.any ?? [])]) {
        expect(codes.has(pre)).toBe(true);
      }
    }
  });
});
