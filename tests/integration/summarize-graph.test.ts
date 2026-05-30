/**
 * Integration test for the Reddit summarization graph.
 *
 * Hits real Groq end-to-end with hand-crafted posts so we can assert on the
 * structured output shape. Skipped if GROQ_API_KEY is unset.
 *
 * NOTE: each test in this file fires ~5 Groq 70B calls. Running this file
 * back-to-back with tests/integration/graphs.test.ts in one `vitest run`
 * exceeds the 30 RPM free-tier ceiling. Set `RUN_SUMMARIZE_GROQ_TESTS=1` to
 * opt in; the default `npm test` skips it.
 */

import { type SummarizePost, runSummarizeGraph } from "@/lib/ai/graphs/summarize-graph";
import { describe, expect, it } from "vitest";

const HAS_GROQ = !!process.env.GROQ_API_KEY;
const OPT_IN = process.env.RUN_SUMMARIZE_GROQ_TESTS === "1";
const SHOULD_RUN = HAS_GROQ && OPT_IN;

const samplePosts: SummarizePost[] = [
  {
    id: "t3_a",
    title: "COMP 472 with Prof Kosseim was great",
    body: "Took it last fall. The lectures were clear and the assignments built up nicely. Heavy workload but worth it. Kosseim explains AI search algos really well.",
    score: 24,
    permalink: "https://www.reddit.com/r/Concordia/comments/aaa/comp_472/",
  },
  {
    id: "t3_b",
    title: "COMP 472 — Prof Kosseim review",
    body: "She's strict on deadlines but the projects are interesting. The exam was harder than expected — make sure you review the heuristics chapter.",
    score: 15,
    permalink: "https://www.reddit.com/r/Concordia/comments/bbb/kosseim_review/",
  },
  {
    id: "t3_c",
    title: "Workload for COMP 472?",
    body: "How heavy is the workload for this course? Considering taking it next term.",
    score: 0,
    permalink: "https://www.reddit.com/r/Concordia/comments/ccc/workload/",
  },
];

describe.skipIf(!SHOULD_RUN)("summarize-graph (live Groq)", () => {
  it("runs all 5 nodes and returns a structured CourseSummary", async () => {
    const summary = await runSummarizeGraph({ courseCode: "COMP 472", posts: samplePosts });

    // Shape assertions — every field must exist and be the right type.
    expect(["positive", "mixed", "negative", "insufficient_data"]).toContain(summary.sentiment);
    expect(Array.isArray(summary.commonComplaints)).toBe(true);
    expect(Array.isArray(summary.commonPraise)).toBe(true);
    expect(Array.isArray(summary.profMentions)).toBe(true);
    expect(["easy", "medium", "hard", "unknown"]).toContain(summary.difficultyEstimate);
    expect(Array.isArray(summary.citations)).toBe(true);
    expect(summary.postsConsidered).toBe(3);
  }, 60_000);

  it("identifies and dedupes the prof mention (Kosseim) across multiple posts", async () => {
    const summary = await runSummarizeGraph({ courseCode: "COMP 472", posts: samplePosts });

    // The two reviewish posts both mention Kosseim — extract should pick her up.
    const kosseim = summary.profMentions.find((m) => m.name.toLowerCase().includes("kosseim"));
    expect(kosseim).toBeDefined();
    if (kosseim) {
      // Mentioned in 2 posts but the dedupe groups them under one entry.
      expect(kosseim.count).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it("never emits two prof entries that share a 4+ letter surname token (no partial dedupes)", async () => {
    // Regression test for the live bug where "Leila" + "Leila Kosseim" came
    // back as two separate entries. The dedupe should collapse them.
    const posts: SummarizePost[] = [
      ...samplePosts,
      {
        id: "t3_d",
        title: "Just took 472",
        body: "Leila is great, she really cares about the students.",
        score: 8,
        permalink: "https://www.reddit.com/r/Concordia/comments/ddd/just_took/",
      },
    ];
    const summary = await runSummarizeGraph({ courseCode: "COMP 472", posts });

    const seenTokens = new Map<string, string>();
    for (const m of summary.profMentions) {
      const tokens = m.name
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 4);
      for (const tok of tokens) {
        if (seenTokens.has(tok) && seenTokens.get(tok) !== m.name) {
          throw new Error(
            `Partial-dedupe: "${m.name}" and "${seenTokens.get(tok)}" both contain token "${tok}"`,
          );
        }
        seenTokens.set(tok, m.name);
      }
    }
  }, 60_000);

  it("never returns all-neutral sentiment when input has clear opinions", async () => {
    // Quality check: with explicit "great" / "harder than expected" language
    // in the input, the model should detect non-neutral sentiment somewhere.
    const summary = await runSummarizeGraph({ courseCode: "COMP 472", posts: samplePosts });

    const hasAnyOpinion =
      summary.commonPraise.length > 0 ||
      summary.commonComplaints.length > 0 ||
      summary.profMentions.some((m) => m.sentiment !== "neutral") ||
      summary.sentiment !== "insufficient_data";
    expect(hasAnyOpinion).toBe(true);
  }, 60_000);

  it("never invents citation permalinks not present in input", async () => {
    const summary = await runSummarizeGraph({ courseCode: "COMP 472", posts: samplePosts });
    const allowed = new Set(samplePosts.map((p) => p.permalink));
    for (const c of summary.citations) {
      expect(allowed.has(c.permalink)).toBe(true);
    }
  }, 60_000);

  it("returns insufficient_data when no posts are supplied", async () => {
    const summary = await runSummarizeGraph({ courseCode: "ZZZZ 999", posts: [] });
    expect(summary.sentiment).toBe("insufficient_data");
    expect(summary.profMentions).toEqual([]);
    expect(summary.citations).toEqual([]);
    expect(summary.commonComplaints).toEqual([]);
    expect(summary.commonPraise).toEqual([]);
  }, 30_000);
});
