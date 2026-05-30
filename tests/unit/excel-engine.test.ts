import { parseExcelPlan } from "@/lib/imports/excel-engine";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

/** Build an .xlsx ArrayBuffer from an array-of-arrays, optionally named. */
function makeWorkbook(aoa: (string | number | null)[][], sheetName = "Term Plan"): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const HEADER = ["Term", "Course", "Title", "Credits", "Type", "Status", "Notes"];
const KNOWN = new Set(["COMP 352", "SOEN 341"]);

describe("parseExcelPlan", () => {
  it("parses valid rows from the Term Plan sheet", () => {
    const buf = makeWorkbook([
      ["My Plan", null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      HEADER,
      ["Fall 2026", "COMP 352", "Data Structures", 3, "SE Core", "In Progress", "Needs COMP 232"],
    ]);
    const rows = parseExcelPlan(buf, KNOWN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      courseCode: "COMP 352",
      term: "Fall 2026",
      year: 2026,
      status: "enrolled",
      notes: "Needs COMP 232",
      errors: [],
    });
  });

  it("flags an unrecognized course code", () => {
    const buf = makeWorkbook([HEADER, ["Fall 2026", "TBD", "", 3, "", "Planned", ""]]);
    const rows = parseExcelPlan(buf, KNOWN);
    expect(rows[0]?.errors).toContain('"TBD" is not a valid course code');
  });

  it("flags an unrecognized term", () => {
    const buf = makeWorkbook([HEADER, ["Spring 2026", "COMP 352", "", 3, "", "Planned", ""]]);
    const rows = parseExcelPlan(buf, KNOWN);
    expect(rows[0]?.errors.some((e) => e.includes("recognized term"))).toBe(true);
  });

  it("flags a valid-format code that is not in the catalog", () => {
    const buf = makeWorkbook([HEADER, ["Fall 2026", "PHYS 999", "", 3, "", "Planned", ""]]);
    const rows = parseExcelPlan(buf, KNOWN);
    expect(rows[0]?.errors).toContain("PHYS 999 is not in the course catalog yet");
  });

  it("suppresses the catalog error when the format is already invalid", () => {
    const buf = makeWorkbook([HEADER, ["Fall 2026", "nope", "", 3, "", "Planned", ""]]);
    const rows = parseExcelPlan(buf, KNOWN);
    // Only the format error, never a catalog error layered on top.
    expect(rows[0]?.errors).toEqual(['"nope" is not a valid course code']);
  });

  it("skips rows with a blank course code", () => {
    const buf = makeWorkbook([
      HEADER,
      ["Fall 2026", "", "", null, "", "", ""],
      ["Fall 2026", "SOEN 341", "", 4, "", "Planned", ""],
    ]);
    const rows = parseExcelPlan(buf, KNOWN);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.courseCode).toBe("SOEN 341");
  });

  it("falls back to the first sheet when no 'Term Plan' sheet exists", () => {
    const buf = makeWorkbook(
      [HEADER, ["Fall 2026", "COMP 352", "", 3, "", "Planned", ""]],
      "Sheet1",
    );
    const rows = parseExcelPlan(buf, KNOWN);
    expect(rows).toHaveLength(1);
  });

  it("returns [] for an empty workbook", () => {
    const buf = makeWorkbook([], "Sheet1");
    expect(parseExcelPlan(buf, KNOWN)).toEqual([]);
  });
});
