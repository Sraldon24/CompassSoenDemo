/**
 * Unit tests for the Reddit community source.
 *
 * Stubs global fetch — never hits the live network. The real-fetch path is
 * exercised in tests/integration/community-sources.test.ts (gated on internet).
 */

import { RedditSearchError, redditSource, searchRedditForCourse } from "@/lib/community/reddit";
import { afterEach, describe, expect, it, vi } from "vitest";

function mockFetchResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? status < 400;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  });
}

const sampleListing = {
  kind: "Listing",
  data: {
    children: [
      {
        kind: "t3",
        data: {
          id: "abc123",
          name: "t3_abc123",
          title: "COMP 472 was great",
          selftext: "Really enjoyed the prof",
          author: "student1",
          score: 42,
          num_comments: 7,
          permalink: "/r/Concordia/comments/abc123/comp_472/",
          created_utc: 1_700_000_000,
          is_self: true,
        },
      },
      {
        kind: "t3",
        data: {
          id: "xyz789",
          name: "t3_xyz789",
          title: "Anyone took COMP 472?",
          selftext: "",
          author: "student2",
          score: 5,
          num_comments: 2,
          permalink: "/r/Concordia/comments/xyz789/anyone/",
          created_utc: 1_705_000_000,
          is_self: false,
        },
      },
      // Should be filtered out — only t3 (submission) kinds count.
      {
        kind: "t1",
        data: {
          id: "ignored",
          name: "t1_ignored",
          title: "",
          selftext: "comment",
          author: "x",
          score: 0,
          num_comments: 0,
          permalink: "/r/whatever",
          created_utc: 1_700_000_000,
          is_self: false,
        },
      },
    ],
  },
};

describe("searchRedditForCourse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps Reddit JSON listing to CommunityPost shape", async () => {
    global.fetch = mockFetchResponse(sampleListing) as unknown as typeof fetch;
    const posts = await searchRedditForCourse("COMP 472");

    expect(posts).toHaveLength(2);
    const first = posts[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first).toMatchObject({
      id: "t3_abc123",
      courseCode: "COMP 472",
      title: "COMP 472 was great",
      body: "Really enjoyed the prof",
      author: "student1",
      score: 42,
      numComments: 7,
      source: "reddit",
    });
    expect(first.url).toBe("https://www.reddit.com/r/Concordia/comments/abc123/comp_472/");
    expect(first.postedAt).toBeInstanceOf(Date);
  });

  it("filters out non-submission kinds (t1 comments etc.)", async () => {
    global.fetch = mockFetchResponse(sampleListing) as unknown as typeof fetch;
    const posts = await searchRedditForCourse("COMP 472");
    expect(posts.find((p) => p.id === "t1_ignored")).toBeUndefined();
  });

  it("returns empty array when listing has no children", async () => {
    global.fetch = mockFetchResponse({ data: { children: [] } }) as unknown as typeof fetch;
    const posts = await searchRedditForCourse("ZZZZ 999");
    expect(posts).toEqual([]);
  });

  it("throws RedditSearchError on non-2xx response (so orchestrator falls back)", async () => {
    global.fetch = mockFetchResponse(
      { error: "rate_limited" },
      { status: 429, ok: false },
    ) as unknown as typeof fetch;

    await expect(searchRedditForCourse("COMP 472")).rejects.toBeInstanceOf(RedditSearchError);
  });

  it("URL-encodes the course code (preserves the space)", async () => {
    const fetchMock = mockFetchResponse(sampleListing) as ReturnType<typeof vi.fn>;
    global.fetch = fetchMock as unknown as typeof fetch;
    await searchRedditForCourse("SOEN 287");
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) return;
    const calledUrl = firstCall[0] as string;
    expect(calledUrl).toContain("q=%22SOEN%20287%22");
    expect(calledUrl).toContain("restrict_sr=on");
  });

  it("sends a descriptive User-Agent (Reddit asks for one)", async () => {
    const fetchMock = mockFetchResponse(sampleListing) as ReturnType<typeof vi.fn>;
    global.fetch = fetchMock as unknown as typeof fetch;
    await searchRedditForCourse("COMP 472");
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) return;
    const init = firstCall[1] as RequestInit | undefined;
    const ua = (init?.headers as Record<string, string> | undefined)?.["User-Agent"];
    expect(ua).toBeTruthy();
    expect((ua ?? "").length).toBeGreaterThan(5);
  });
});

describe("redditSource adapter", () => {
  it("conforms to the CommunitySource interface", () => {
    expect(redditSource.name).toBe("reddit");
    expect(typeof redditSource.search).toBe("function");
  });
});
