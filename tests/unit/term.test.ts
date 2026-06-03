import {
  TERM_REGEX,
  formatTerm,
  groupByTerm,
  isSameTerm,
  isTermBefore,
  parseTerm,
  sortTerms,
  termOrdinal,
  termRange,
  termToStartDate,
  termYear,
} from "@/lib/domain/term";
import { describe, expect, it } from "vitest";

describe("parseTerm", () => {
  it("parses well-formed labels and preserves raw", () => {
    expect(parseTerm("Fall 2026")).toEqual({ raw: "Fall 2026", season: "Fall", year: 2026 });
  });

  it("is case-insensitive but canonicalizes season casing", () => {
    expect(parseTerm("fall 2026")).toEqual({ raw: "fall 2026", season: "Fall", year: 2026 });
    expect(parseTerm("WINTER 2027")?.season).toBe("Winter");
  });

  it("rejects malformed labels", () => {
    expect(parseTerm("Spring 2026")).toBeNull();
    expect(parseTerm("Fall")).toBeNull();
    expect(parseTerm("")).toBeNull();
  });
});

describe("TERM_REGEX (strict, case-sensitive user-input guard)", () => {
  it("accepts canonical Title-case labels", () => {
    expect(TERM_REGEX.test("Fall 2026")).toBe(true);
  });

  it("rejects lowercase — strict guard must not loosen", () => {
    expect(TERM_REGEX.test("fall 2026")).toBe(false);
    expect(TERM_REGEX.test("Spring 2026")).toBe(false);
  });
});

describe("termOrdinal / compare", () => {
  it("orders within a year: Winter < Summer < Fall", () => {
    expect(termOrdinal("Winter 2027")).toBeLessThan(termOrdinal("Summer 2027"));
    expect(termOrdinal("Summer 2027")).toBeLessThan(termOrdinal("Fall 2027"));
  });

  it("orders across years: Fall 2026 < Winter 2027", () => {
    expect(termOrdinal("Fall 2026")).toBeLessThan(termOrdinal("Winter 2027"));
  });

  it("accepts both parsed labels and raw strings", () => {
    const f = parseTerm("Fall 2026");
    if (!f) throw new Error("unreachable");
    expect(termOrdinal(f)).toBe(termOrdinal("Fall 2026"));
  });

  it("isTermBefore / isSameTerm guard unparseable input", () => {
    expect(isTermBefore("Fall 2026", "Winter 2027")).toBe(true);
    expect(isTermBefore("garbage", "Fall 2026")).toBe(false);
    expect(isSameTerm("Fall 2026", "Fall 2026")).toBe(true);
    expect(isSameTerm("Fall 2026", "nope")).toBe(false);
  });
});

describe("termYear (lenient)", () => {
  it("extracts any 4-digit run", () => {
    expect(termYear("Fall 2026")).toBe(2026);
    expect(termYear("Cégep 2024 transfer")).toBe(2024);
  });

  it("returns 0 when no year present", () => {
    expect(termYear("Fall")).toBe(0);
  });
});

describe("formatTerm", () => {
  it("round-trips with parseTerm", () => {
    const t = parseTerm("Summer 2030");
    if (!t) throw new Error("unreachable");
    expect(formatTerm(t.season, t.year)).toBe("Summer 2030");
  });
});

describe("termRange", () => {
  it("produces an inclusive chronological sequence with year rollover", () => {
    expect(termRange("Fall 2026", "Summer 2027")).toEqual([
      "Fall 2026",
      "Winter 2027",
      "Summer 2027",
    ]);
  });

  it("returns a single term when start === end", () => {
    expect(termRange("Winter 2027", "Winter 2027")).toEqual(["Winter 2027"]);
  });

  it("returns [] for unparseable endpoints or reversed range", () => {
    expect(termRange("garbage", "Fall 2027")).toEqual([]);
    expect(termRange("Fall 2027", "Fall 2026")).toEqual([]);
  });
});

describe("sortTerms", () => {
  it("sorts chronologically regardless of input order", () => {
    expect(sortTerms(["Fall 2027", "Winter 2027", "Summer 2027"])).toEqual([
      "Winter 2027",
      "Summer 2027",
      "Fall 2027",
    ]);
  });
});

describe("groupByTerm", () => {
  const rows = [
    { term: "Fall 2026", code: "A", status: "planned" },
    { term: "Fall 2026", code: "B", status: "dropped" },
    { term: "Winter 2027", code: "C", status: "planned" },
  ];

  it("buckets by the term field", () => {
    const m = groupByTerm(rows);
    expect(m.get("Fall 2026")).toHaveLength(2);
    expect(m.get("Winter 2027")).toHaveLength(1);
  });

  it("applies the optional keep filter", () => {
    const m = groupByTerm(rows, (r) => r.status !== "dropped");
    expect(m.get("Fall 2026")).toHaveLength(1);
  });
});

describe("termToStartDate", () => {
  it("maps season to a placeholder ISO start date", () => {
    expect(termToStartDate("Fall 2026")).toBe("2026-09-04");
    expect(termToStartDate("Winter 2027")).toBe("2027-01-08");
    expect(termToStartDate("Summer 2028")).toBe("2028-05-06");
  });

  it("returns null for unparseable labels", () => {
    expect(termToStartDate("Spring 2026")).toBeNull();
  });
});
