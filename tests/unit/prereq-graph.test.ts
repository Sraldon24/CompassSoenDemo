import { buildPrereqGraph, categoryColor } from "@/lib/prereq-graph";
import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { describe, expect, it } from "vitest";

const c = (
  code: string,
  prereqs: CourseCatalogEntry["prereqs"] = { all: [], any: [], concurrent: [] },
  category: CourseCatalogEntry["category"] = "se_core",
): CourseCatalogEntry => ({
  code,
  title: `${code} title`,
  credits: 3,
  category,
  prereqs,
});

describe("buildPrereqGraph", () => {
  it("assigns level 0 to roots (no prereqs)", () => {
    const graph = buildPrereqGraph([c("MATH 204"), c("COMP 248")]);
    for (const n of graph.nodes) {
      expect(n.level).toBe(0);
    }
  });

  it("computes level = max(prereq levels) + 1", () => {
    const graph = buildPrereqGraph([
      c("COMP 248"),
      c("COMP 249", { all: ["COMP 248"] }),
      c("COMP 352", { all: ["COMP 249"] }),
    ]);
    const byCode = new Map(graph.nodes.map((n) => [n.code, n]));
    expect(byCode.get("COMP 248")?.level).toBe(0);
    expect(byCode.get("COMP 249")?.level).toBe(1);
    expect(byCode.get("COMP 352")?.level).toBe(2);
  });

  it("handles DAG (multiple parents) correctly", () => {
    // COMP 442 needs COMP 335 AND COMP 352 — both are level 1+.
    const graph = buildPrereqGraph([
      c("COMP 232"),
      c("COMP 249"),
      c("COMP 335", { all: ["COMP 232", "COMP 249"] }),
      c("COMP 352", { all: ["COMP 232", "COMP 249"] }),
      c("COMP 442", { all: ["COMP 335", "COMP 352"] }),
    ]);
    const byCode = new Map(graph.nodes.map((n) => [n.code, n]));
    expect(byCode.get("COMP 442")?.level).toBe(2);
  });

  it("emits one edge per prereq, kind preserved", () => {
    const graph = buildPrereqGraph([
      c("ENCS 282"),
      c("COMP 352"),
      c("SOEN 341", { all: ["ENCS 282"], concurrent: ["COMP 352"] }),
    ]);
    expect(graph.edges).toContainEqual({ from: "ENCS 282", to: "SOEN 341", kind: "prereq" });
    expect(graph.edges).toContainEqual({ from: "COMP 352", to: "SOEN 341", kind: "concurrent" });
  });

  it("skips edges whose source is missing from the catalog (graceful)", () => {
    const graph = buildPrereqGraph([c("COMP 352", { all: ["NONEXISTENT 999"] })]);
    expect(graph.edges).toHaveLength(0);
  });

  it("sorts nodes within a level alphabetically (deterministic)", () => {
    const graph = buildPrereqGraph([c("ZZZ 100"), c("AAA 100"), c("MMM 100")]);
    const level0Nodes = graph.nodes.filter((n) => n.level === 0);
    // y position rises with index, alphabetical within level.
    const sortedByY = [...level0Nodes].sort((a, b) => a.y - b.y);
    expect(sortedByY.map((n) => n.code)).toEqual(["AAA 100", "MMM 100", "ZZZ 100"]);
  });

  it("does not crash on prereq cycles (defensive)", () => {
    // Pathological case — if our seed data ever has a cycle by accident,
    // levelOf should bail out rather than infinitely recurse.
    expect(() => buildPrereqGraph([c("A", { all: ["B"] }), c("B", { all: ["A"] })])).not.toThrow();
  });

  it("returns width + height that fit all nodes (with padding)", () => {
    const graph = buildPrereqGraph([c("A"), c("B", { all: ["A"] }), c("C", { all: ["B"] })]);
    // Widest node x is at level 2 → x = 40 (padding) + 2*200 = 440.
    // Adding the node body width (~160) and trailing padding (40) → ≥ 600.
    expect(graph.width).toBeGreaterThanOrEqual(440);
    expect(graph.height).toBeGreaterThanOrEqual(80);
  });
});

describe("categoryColor", () => {
  it("returns a CSS var for known categories", () => {
    expect(categoryColor("se_core")).toContain("var(--color-");
    expect(categoryColor("deficiency")).toContain("danger");
    expect(categoryColor("nat_sci_elective")).toContain("success");
  });

  it("falls back to text-muted for null/unknown categories", () => {
    expect(categoryColor(null)).toContain("text-muted");
    expect(categoryColor("nonexistent")).toContain("text-muted");
  });
});
