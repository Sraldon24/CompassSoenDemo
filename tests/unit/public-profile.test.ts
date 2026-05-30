import { slugify } from "@/lib/community/slug";
import { describe, expect, it } from "vitest";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Amir Ghadimi")).toBe("amir-ghadimi");
  });

  it("strips punctuation", () => {
    expect(slugify("Amir Ghadimi!!!")).toBe("amir-ghadimi");
    expect(slugify("a.b_c@d")).toBe("a-b-c-d");
  });

  it("collapses repeated separators", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  it("caps at 40 chars", () => {
    const long = "a".repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it("returns empty string for all-punctuation input", () => {
    expect(slugify("!!!")).toBe("");
  });
});
