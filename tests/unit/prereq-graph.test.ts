import {
  type GraphEdge,
  bezierPath,
  buildPrereqGraph,
  categoryColor,
  computeChain,
} from "@/lib/domain/prereq-graph";
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

describe("computeChain", () => {
  // A → B → C, and B → D. (A unlocks B; B unlocks C and D.)
  const edges: GraphEdge[] = [
    { from: "A", to: "B", kind: "prereq" },
    { from: "B", to: "C", kind: "prereq" },
    { from: "B", to: "D", kind: "prereq" },
  ];

  it("collects transitive ancestors (what a course depends on)", () => {
    const chain = computeChain("C", edges);
    expect([...chain.ancestors].sort()).toEqual(["A", "B"]);
  });

  it("collects transitive descendants (what a course unlocks)", () => {
    const chain = computeChain("A", edges);
    expect([...chain.descendants].sort()).toEqual(["B", "C", "D"]);
  });

  it("includes the course itself in nodes but not in ancestors/descendants", () => {
    const chain = computeChain("B", edges);
    expect(chain.nodes.has("B")).toBe(true);
    expect(chain.ancestors.has("B")).toBe(false);
    expect(chain.descendants.has("B")).toBe(false);
    // B's chain: ancestor A, descendants C + D, plus B → 4 nodes.
    expect(chain.nodes.size).toBe(4);
  });

  it("marks only edges that lie within the chain", () => {
    const chain = computeChain("C", edges);
    // C's chain is {A,B,C}; the B→D edge is NOT on it.
    expect(chain.edges.has("A->B")).toBe(true);
    expect(chain.edges.has("B->C")).toBe(true);
    expect(chain.edges.has("B->D")).toBe(false);
  });

  it("is cycle-safe", () => {
    const cyclic: GraphEdge[] = [
      { from: "X", to: "Y", kind: "prereq" },
      { from: "Y", to: "X", kind: "prereq" },
    ];
    expect(() => computeChain("X", cyclic)).not.toThrow();
  });

  it("returns empty chain for an isolated node", () => {
    const chain = computeChain("Z", edges);
    expect(chain.ancestors.size).toBe(0);
    expect(chain.descendants.size).toBe(0);
    expect([...chain.nodes]).toEqual(["Z"]);
  });
});

describe("bezierPath", () => {
  it("starts at the source and ends at the target point", () => {
    const d = bezierPath(0, 10, 100, 50);
    expect(d.startsWith("M 0,10")).toBe(true);
    expect(d.endsWith("100,50")).toBe(true);
  });

  it("puts both control points at the horizontal midpoint", () => {
    // midpoint of x 0→100 is 50; both control x's should be 50.
    const d = bezierPath(0, 0, 100, 80);
    expect(d).toContain("C 50,0 50,80");
  });
});

describe("buildPrereqGraph — barycenter ordering", () => {
  const mk = (
    code: string,
    prereqs: CourseCatalogEntry["prereqs"] = { all: [], any: [], concurrent: [] },
  ): CourseCatalogEntry => ({ code, title: code, credits: 3, category: "se_core", prereqs });

  it("reorders a level so children follow their parents' vertical order", () => {
    // Level 0 (alphabetical): AAA(0), BBB(1), CCC(2).
    // Level 1 children: childOfCCC depends on CCC(2), childOfAAA depends on AAA(0).
    // Alphabetically "childA…" < "childC…", but barycenter must put childOfAAA
    // ABOVE childOfCCC (parent idx 0 < 2) — i.e. ordering follows parents, not the alphabet.
    const graph = buildPrereqGraph([
      mk("AAA 100"),
      mk("BBB 100"),
      mk("CCC 100"),
      mk("MMM 200", { all: ["CCC 100"] }), // parent idx 2 → bary 2
      mk("NNN 200", { all: ["AAA 100"] }), // parent idx 0 → bary 0
    ]);
    const level1 = graph.nodes.filter((n) => n.level === 1).sort((a, b) => a.y - b.y);
    // NNN (parent AAA, idx 0) should come before MMM (parent CCC, idx 2),
    // even though "MMM" < "NNN" alphabetically.
    expect(level1.map((n) => n.code)).toEqual(["NNN 200", "MMM 200"]);
  });

  it("stays deterministic: same input → same ordering", () => {
    const input = [mk("AAA 100"), mk("BBB 100", { all: ["AAA 100"] })];
    const a = buildPrereqGraph(input).nodes.map((n) => `${n.code}@${n.x},${n.y}`);
    const b = buildPrereqGraph(input).nodes.map((n) => `${n.code}@${n.x},${n.y}`);
    expect(a).toEqual(b);
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
