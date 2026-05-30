/**
 * Unit tests for the pure (non-LLM) parts of the Reddit summarization graph.
 *
 * The actual graph end-to-end is exercised in integration tests against real
 * Groq, but the deterministic helpers — name normalization, JSON parsing,
 * post formatting — must be pinned here so we don't silently regress them.
 */

import { type SummarizePost, _testing } from "@/lib/ai/graphs/summarize-graph";
import { describe, expect, it } from "vitest";

const { normalizeProfName, parseJsonLoose, formatPosts, findGroupKey } = _testing;

describe("normalizeProfName", () => {
  it("strips honorifics and lowercases", () => {
    expect(normalizeProfName("Dr. Kosseim")).toBe("kosseim");
    expect(normalizeProfName("Prof. Kosseim")).toBe("kosseim");
    expect(normalizeProfName("Professor Kosseim")).toBe("kosseim");
    expect(normalizeProfName("Mr. Kosseim")).toBe("kosseim");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeProfName("  René   Witté  ")).toBe("rene witte");
  });

  it("strips diacritics so accent variants merge", () => {
    expect(normalizeProfName("René Witté")).toBe("rene witte");
    expect(normalizeProfName("Rene Witte")).toBe("rene witte");
    expect(normalizeProfName("RENÉ WITTÉ")).toBe("rene witte");
  });

  it("treats different honorific spellings as identical after normalize", () => {
    expect(normalizeProfName("Dr. René Witté")).toBe(normalizeProfName("Prof Rene Witte"));
  });
});

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences the model sometimes adds", () => {
    const fenced = '```json\n{"a": 1}\n```';
    expect(parseJsonLoose<{ a: number }>(fenced)).toEqual({ a: 1 });
  });

  it("strips bare ``` fences too", () => {
    const fenced = '```\n{"a": 1}\n```';
    expect(parseJsonLoose<{ a: number }>(fenced)).toEqual({ a: 1 });
  });

  it("extracts JSON from a noisy preamble (fallback regex path)", () => {
    const noisy = 'Sure! Here is the JSON: {"a": 1}\nLet me know if that works.';
    expect(parseJsonLoose<{ a: number }>(noisy)).toEqual({ a: 1 });
  });

  it("returns null on unrecoverable garbage", () => {
    expect(parseJsonLoose("not json at all")).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(parseJsonLoose("")).toBeNull();
  });
});

describe("findGroupKey (token-overlap dedupe)", () => {
  it("merges a first-name-only mention into a full-name group", () => {
    // Regression for the live bug: "Leila" + "Leila Kosseim" must collapse.
    const grouped = new Map([
      ["leila kosseim", { name: "Leila Kosseim", count: 1, sentiment: "neutral" }],
    ]);
    expect(findGroupKey(grouped, normalizeProfName("Leila"))).toBe("leila kosseim");
  });

  it("merges a full-name mention into a first-name-only group (symmetric)", () => {
    const grouped = new Map([["leila", { name: "Leila", count: 1, sentiment: "neutral" }]]);
    expect(findGroupKey(grouped, normalizeProfName("Leila Kosseim"))).toBe("leila");
  });

  it("does NOT merge unrelated names that share short tokens", () => {
    // "de la" or "van" type fragments shouldn't merge unrelated profs.
    const grouped = new Map([["de la rosa", { name: "De La Rosa", count: 1, sentiment: "n" }]]);
    expect(findGroupKey(grouped, normalizeProfName("De Vega"))).toBeUndefined();
  });

  it("returns undefined when no overlap exists", () => {
    const grouped = new Map([["kosseim", { name: "Kosseim", count: 1, sentiment: "n" }]]);
    expect(findGroupKey(grouped, "bergler")).toBeUndefined();
  });

  it("exact-match short keys still work (4-letter surname)", () => {
    const grouped = new Map([["xian", { name: "Xian", count: 1, sentiment: "n" }]]);
    expect(findGroupKey(grouped, "xian")).toBe("xian");
  });
});

describe("formatPosts", () => {
  const posts: SummarizePost[] = [
    {
      id: "t3_a",
      title: "Took COMP 472",
      body: "It was great, prof Kosseim is fantastic.",
      score: 12,
      permalink: "https://reddit.com/x",
    },
    {
      id: "t3_b",
      title: "Anyone took COMP 472?",
      body: "",
      score: null,
      permalink: "https://reddit.com/y",
    },
  ];

  it("includes title, body, score, and link in each entry", () => {
    const out = formatPosts(posts);
    expect(out).toContain("Took COMP 472");
    expect(out).toContain("prof Kosseim");
    expect(out).toContain("score=12");
    expect(out).toContain("https://reddit.com/x");
  });

  it("renders null score as '?' (not the string 'null')", () => {
    const out = formatPosts(posts);
    expect(out).toContain("score=?");
    expect(out).not.toContain("score=null");
  });

  it("separates posts with --- delimiter", () => {
    const out = formatPosts(posts);
    expect(out.split("---")).toHaveLength(2);
  });

  it("truncates bodies above 600 chars with an ellipsis", () => {
    const longBody = "x".repeat(1_000);
    const truncated = formatPosts([
      { id: "t3_a", title: "T", body: longBody, score: 1, permalink: "u" },
    ]);
    // Should contain at most 600 x's + the ellipsis, not all 1000.
    expect(truncated).toContain("…");
    const xCount = (truncated.match(/x/g) ?? []).length;
    expect(xCount).toBeLessThanOrEqual(600);
  });
});
