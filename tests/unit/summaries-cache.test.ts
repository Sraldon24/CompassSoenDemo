/**
 * Unit tests for the summary cache layer (stale-while-revalidate), exercised
 * through the injected-deps seam — no DB, no Groq.
 */

import type { CourseSummary, SummarizePost } from "@/lib/ai/graphs/summarize-graph";
import { type SummaryDeps, _deps } from "@/lib/community/summaries";
import { describe, expect, it, vi } from "vitest";

const FAKE_SUMMARY: CourseSummary = {
  sentiment: "mixed",
  commonComplaints: [],
  commonPraise: [],
  profMentions: [],
  difficultyEstimate: "medium",
  citations: [],
  postsConsidered: 0,
};

const FAKE_POSTS: SummarizePost[] = [
  { id: "p1", title: "t", body: "b", score: 5, permalink: "https://r/x" },
];

const DAY = 24 * 60 * 60 * 1000;

function makeDeps(over: Partial<SummaryDeps> = {}): SummaryDeps {
  return {
    loadStored: vi.fn().mockResolvedValue(null),
    loadPosts: vi.fn().mockResolvedValue(FAKE_POSTS),
    runGraph: vi.fn().mockResolvedValue(FAKE_SUMMARY),
    saveRow: vi.fn().mockResolvedValue(undefined),
    deleteRow: vi.fn().mockResolvedValue(undefined),
    now: () => 1_000_000_000_000,
    ...over,
  };
}

describe("summary cache (deps-injected)", () => {
  it("cold cache → regenerates synchronously and saves", async () => {
    const deps = makeDeps();
    const row = await _deps.getCourseSummary("COMP 472", deps);
    expect(deps.runGraph).toHaveBeenCalledOnce();
    expect(deps.saveRow).toHaveBeenCalledOnce();
    expect(row?.summary.sentiment).toBe("mixed");
  });

  it("fresh cache hit → returns cached, no LLM call", async () => {
    const now = 1_000_000_000_000;
    const deps = makeDeps({
      now: () => now,
      loadStored: vi.fn().mockResolvedValue({
        courseCode: "COMP 472",
        summary: FAKE_SUMMARY,
        postCount: 3,
        generatedAt: new Date(now - 1 * DAY), // 1 day old < 7d TTL
      }),
    });
    const row = await _deps.getCourseSummary("COMP 472", deps);
    expect(deps.runGraph).not.toHaveBeenCalled();
    expect(row?.summary.postsConsidered).toBe(3);
    expect(row?.isStale).toBe(false);
  });

  it("stale cache hit → returns stale immediately AND kicks off regen", async () => {
    const now = 1_000_000_000_000;
    const runGraph = vi.fn().mockResolvedValue(FAKE_SUMMARY);
    const deps = makeDeps({
      now: () => now,
      runGraph,
      loadStored: vi.fn().mockResolvedValue({
        courseCode: "COMP 472",
        summary: FAKE_SUMMARY,
        postCount: 2,
        generatedAt: new Date(now - 10 * DAY), // 10 days old > 7d TTL
      }),
    });
    const row = await _deps.getCourseSummary("COMP 472", deps);
    expect(row?.isStale).toBe(true); // returns the stale row right away
    // background regen was triggered (fire-and-forget)
    await Promise.resolve();
    expect(runGraph).toHaveBeenCalledOnce();
  });

  it("regenerate with zero posts → deletes the row and returns null", async () => {
    const deps = makeDeps({ loadPosts: vi.fn().mockResolvedValue([]) });
    const row = await _deps.regenerate("ZZZZ 999", deps);
    expect(row).toBeNull();
    expect(deps.deleteRow).toHaveBeenCalledOnce();
    expect(deps.runGraph).not.toHaveBeenCalled();
  });

  it("caps the graph input at 8 posts", async () => {
    const manyPosts: SummarizePost[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      title: "t",
      body: "b",
      score: 20 - i,
      permalink: `https://r/${i}`,
    }));
    const runGraph = vi.fn().mockResolvedValue(FAKE_SUMMARY);
    const deps = makeDeps({ loadPosts: vi.fn().mockResolvedValue(manyPosts), runGraph });
    await _deps.regenerate("COMP 472", deps);
    const arg = runGraph.mock.calls[0]?.[0];
    expect(arg.posts).toHaveLength(8);
  });
});
