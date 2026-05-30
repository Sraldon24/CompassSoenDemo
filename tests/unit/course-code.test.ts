import { cellStr, extractCourseCodes, isCourseCode, statusFromString } from "@/lib/courses/code";
import { describe, expect, it } from "vitest";

describe("isCourseCode", () => {
  it("accepts well-formed codes with or without a space", () => {
    expect(isCourseCode("COMP 352")).toBe(true);
    expect(isCourseCode("COMP352")).toBe(true);
    expect(isCourseCode("ENCS 282")).toBe(true);
  });

  it("rejects placeholders and malformed codes", () => {
    expect(isCourseCode("TBD")).toBe(false);
    expect(isCourseCode("Nat Sci Elective 2")).toBe(false);
    expect(isCourseCode("COMP 35")).toBe(false);
  });
});

describe("extractCourseCodes", () => {
  it("pulls distinct codes from freeform text, normalized to 'DEPT NNN'", () => {
    expect(extractCourseCodes("Needs COMP232 and SOEN 341")).toEqual(["COMP 232", "SOEN 341"]);
  });

  it("dedupes repeats", () => {
    expect(extractCourseCodes("COMP 352, COMP 352")).toEqual(["COMP 352"]);
  });

  it("returns [] when no codes present", () => {
    expect(extractCourseCodes("none")).toEqual([]);
  });
});

describe("cellStr", () => {
  it("coerces numbers and null safely", () => {
    expect(cellStr(3.5)).toBe("3.5");
    expect(cellStr(null)).toBe("");
    expect(cellStr(undefined)).toBe("");
    expect(cellStr("Fall 2026")).toBe("Fall 2026");
  });
});

describe("statusFromString", () => {
  it("maps keyword variants to normalized status", () => {
    expect(statusFromString("Done")).toBe("transferred");
    expect(statusFromString("Transfer credit")).toBe("transferred");
    expect(statusFromString("In Progress")).toBe("enrolled");
    expect(statusFromString("Enrolled")).toBe("enrolled");
    expect(statusFromString("Discontinued")).toBe("disc");
    expect(statusFromString("Dropped")).toBe("dropped");
    expect(statusFromString("Failed")).toBe("failed");
  });

  it("maps 'completed' to completed (not planned, not transferred)", () => {
    // Regression: code-reviewer found "completed" silently fell through to
    // "planned" because only "done"/"transfer" were mapped.
    expect(statusFromString("Completed")).toBe("completed");
    expect(statusFromString("completed")).toBe("completed");
    // "Done" stays transferred (credited-elsewhere convention).
    expect(statusFromString("Done")).toBe("transferred");
  });

  it("defaults to planned for empty/unknown", () => {
    expect(statusFromString(null)).toBe("planned");
    expect(statusFromString("")).toBe("planned");
    expect(statusFromString("whatever")).toBe("planned");
  });
});
