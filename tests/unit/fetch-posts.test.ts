/**
 * Unit tests for the pure Reddit→Brave fallback decision. Fake sources, no
 * network/DB. This is the logic that previously lived untestable inside the
 * scrape-reddit script's scrapeOne.
 */

import { BraveBudgetExceededError } from "@/lib/community/brave";
import { fetchPostsForCourse } from "@/lib/community/fetch-posts";
import { RedditSearchError } from "@/lib/community/reddit";
import type { CommunityPost, CommunitySource } from "@/lib/community/source";
import { describe, expect, it, vi } from "vitest";

function post(id: string): CommunityPost {
  return {
    id,
    courseCode: "COMP 472",
    title: "t",
    body: "b",
    author: null,
    score: 1,
    numComments: null,
    url: "https://x",
    postedAt: null,
    source: "reddit",
  };
}

const src = (name: "reddit" | "brave", impl: CommunitySource["search"]): CommunitySource => ({
  name,
  search: impl,
});

const OPTS = { limit: 25, useFallback: true };

describe("fetchPostsForCourse", () => {
  it("uses Reddit when it returns posts (no Brave call)", async () => {
    const brave = vi.fn();
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => [post("a")]),
      src("brave", brave),
      OPTS,
    );
    expect(r).toMatchObject({ ok: true, source: "reddit" });
    expect(brave).not.toHaveBeenCalled();
  });

  it("falls back to Brave when Reddit returns empty", async () => {
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => []),
      src("brave", async () => [post("b")]),
      OPTS,
    );
    expect(r).toMatchObject({ ok: true, source: "brave" });
  });

  it("falls back to Brave when Reddit throws RedditSearchError", async () => {
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => {
        throw new RedditSearchError("429", 429);
      }),
      src("brave", async () => [post("b")]),
      OPTS,
    );
    expect(r).toMatchObject({ ok: true, source: "brave" });
  });

  it("re-throws a non-RedditSearchError from the primary (genuine bug)", async () => {
    await expect(
      fetchPostsForCourse(
        "COMP 472",
        src("reddit", async () => {
          throw new TypeError("boom");
        }),
        src("brave", async () => []),
        OPTS,
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("does NOT call Brave when useFallback is false", async () => {
    const brave = vi.fn();
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => []),
      src("brave", brave),
      { limit: 25, useFallback: false },
    );
    expect(r).toMatchObject({ ok: true, source: "none" });
    expect(brave).not.toHaveBeenCalled();
  });

  it("caps the Brave limit at 10 even when the primary limit is higher", async () => {
    const brave = vi.fn().mockResolvedValue([post("b")]);
    await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => []),
      src("brave", brave),
      {
        limit: 25,
        useFallback: true,
      },
    );
    expect(brave).toHaveBeenCalledWith("COMP 472", 10);
  });

  it("returns budget_exhausted (caller stops) on BraveBudgetExceededError", async () => {
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => []),
      src("brave", async () => {
        throw new BraveBudgetExceededError(1000, 1000);
      }),
      OPTS,
    );
    expect(r).toMatchObject({ ok: false, reason: "budget_exhausted", used: 1000, budget: 1000 });
  });

  it("returns reason:error on a transient Brave failure", async () => {
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => []),
      src("brave", async () => {
        throw new Error("brave 500");
      }),
      OPTS,
    );
    expect(r).toMatchObject({ ok: false, reason: "error" });
  });

  it("both empty → ok with source none", async () => {
    const r = await fetchPostsForCourse(
      "COMP 472",
      src("reddit", async () => []),
      src("brave", async () => []),
      OPTS,
    );
    expect(r).toMatchObject({ ok: true, source: "none", posts: [] });
  });
});
