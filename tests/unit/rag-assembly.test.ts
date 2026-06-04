/**
 * Unit tests for the PURE RAG assembly layer (no DB / pgvector / embedder).
 * These assert the observable contract of assembleRAGContext + the query code
 * extractor — section ordering, force-include of explicit mentions, scoring
 * (1 - distance), plan-line wiring, and context truncation.
 */

import {
  type CourseHit,
  type ExplicitHit,
  type PlanRow,
  type RedditHit,
  assembleRAGContext,
  extractCodesFromQuery,
  similarityFromDistance,
} from "@/lib/ai/rag";
import { describe, expect, it } from "vitest";

describe("extractCodesFromQuery", () => {
  it("pulls normalized, deduped course codes", () => {
    expect(extractCodesFromQuery("can I take COMP472 after COMP 248?")).toEqual([
      "COMP 472",
      "COMP 248",
    ]);
    expect(extractCodesFromQuery("COMP 352 COMP352 comp 352")).toEqual(["COMP 352"]);
  });
  it("returns [] when no codes present", () => {
    expect(extractCodesFromQuery("what is a good easy elective?")).toEqual([]);
  });
});

const explicit = (code: string): ExplicitHit => ({
  code,
  title: `${code} Title`,
  description: "desc",
  category: "se_core",
  credits: 3,
  prereqs: { all: ["MATH 204"] },
});
const courseHit = (code: string, distance: number): CourseHit => ({
  code,
  title: `${code} Title`,
  description: "desc",
  category: "se_core",
  credits: 3,
  distance,
});
const redditHit = (id: string, distance: number): RedditHit => ({
  id,
  title: `post ${id}`,
  body: "body text",
  url: "https://reddit.com/x",
  distance,
});
const empty = {
  explicitHits: [],
  courseHits: [],
  redditHits: [],
  planByCode: new Map<string, PlanRow>(),
};

describe("assembleRAGContext", () => {
  it("returns empty text/sources when there are no hits", () => {
    const r = assembleRAGContext(empty);
    expect(r.text).toBe("");
    expect(r.sources).toEqual([]);
  });

  it("scores semantic course hits as max(0, 1 - distance)", () => {
    const r = assembleRAGContext({ ...empty, courseHits: [courseHit("COMP 352", 0.25)] });
    expect(r.sources[0]?.score).toBeCloseTo(0.75);
    expect(r.sources[0]?.id).toBe("course:COMP 352");
  });

  it("similarityFromDistance clamps to [0, 1]", () => {
    expect(similarityFromDistance(0.25)).toBeCloseTo(0.75);
    expect(similarityFromDistance(1.6)).toBe(0); // distance > 1 → clamp to 0
    expect(similarityFromDistance(-0.4)).toBe(1); // distance < 0 → clamp to 1
  });

  it("drops semantic hits below the relevance floor (noise filtering)", () => {
    // similarity 1 - 0.95 = 0.05 < 0.2 floor → filtered out entirely.
    const r = assembleRAGContext({ ...empty, courseHits: [courseHit("COMP 352", 0.95)] });
    expect(r.sources).toEqual([]);
    expect(r.text).toBe("");
  });

  it("keeps semantic hits at or above the relevance floor", () => {
    // similarity 1 - 0.79 = 0.21 ≥ 0.2 floor → kept.
    const r = assembleRAGContext({ ...empty, courseHits: [courseHit("COMP 352", 0.79)] });
    expect(r.sources[0]?.id).toBe("course:COMP 352");
  });

  it("never filters force-included explicit mentions (always score 1.0)", () => {
    // Even paired with a noisy semantic hit, the explicit course survives.
    const r = assembleRAGContext({
      ...empty,
      explicitHits: [explicit("COMP 472")],
      courseHits: [courseHit("COMP 352", 0.99)], // below floor → dropped
    });
    expect(r.sources.map((s) => s.id)).toEqual(["course:COMP 472"]);
  });

  it("force-includes explicit mentions FIRST with score 1.0 and an E-prefixed section", () => {
    const r = assembleRAGContext({
      ...empty,
      explicitHits: [explicit("COMP 472")],
      courseHits: [courseHit("COMP 352", 0.2)],
    });
    expect(r.sources[0]?.score).toBe(1.0); // explicit first
    expect(r.text).toContain("## Courses you explicitly mentioned");
    expect(r.text.indexOf("explicitly mentioned")).toBeLessThan(
      r.text.indexOf("Course catalog matches"),
    );
    expect(r.text).toContain("[E1] COMP 472");
  });

  it("wires the user's plan status into the text", () => {
    const planByCode = new Map<string, PlanRow>([
      ["COMP 472", { courseCode: "COMP 472", term: "Fall 2027", status: "planned" }],
    ]);
    const r = assembleRAGContext({ ...empty, explicitHits: [explicit("COMP 472")], planByCode });
    expect(r.text).toContain("Your plan: planned in Fall 2027.");
  });

  it("orders sections explicit → course → reddit", () => {
    const r = assembleRAGContext({
      explicitHits: [explicit("COMP 472")],
      courseHits: [courseHit("COMP 352", 0.2)],
      redditHits: [redditHit("t3_1", 0.3)],
      planByCode: new Map(),
    });
    const iE = r.text.indexOf("explicitly mentioned");
    const iC = r.text.indexOf("Course catalog matches");
    const iR = r.text.indexOf("Recent Reddit discussion");
    expect(iE).toBeLessThan(iC);
    expect(iC).toBeLessThan(iR);
    expect(r.sources.map((s) => s.kind)).toEqual(["course", "course", "reddit"]);
  });

  it("truncates very long context", () => {
    const big: CourseHit[] = Array.from({ length: 40 }, (_, i) => ({
      ...courseHit(`COMP ${100 + i}`, 0.1),
      description: "x".repeat(600),
    }));
    const r = assembleRAGContext({ ...empty, courseHits: big });
    expect(r.text.length).toBeLessThanOrEqual(4_500 + 30);
    expect(r.text).toContain("(context truncated)");
  });
});
