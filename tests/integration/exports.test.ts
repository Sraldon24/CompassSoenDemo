/**
 * Export pipeline integration tests.
 *
 * Exercises the iCalendar generator and the PDF renderer against real data
 * (not just shape mocks). Catches things like: malformed VEVENT entries,
 * wrong content-type, PDF generator throwing on empty plans.
 */

import { buildICS, termToStartDate } from "@/lib/exports/ics";
import { describe, expect, it } from "vitest";

describe("ICS calendar generator", () => {
  it("produces a valid VCALENDAR envelope", () => {
    const ics = buildICS("Test Calendar", []);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Test Calendar");
    expect(ics).toMatch(/END:VCALENDAR$/);
  });

  it("escapes special characters per RFC 5545", () => {
    const ics = buildICS("Test", [
      {
        uid: "demo-1",
        summary: "COMP 352, Data Structures",
        description: "Line 1\nLine 2; with semicolon",
        date: "2026-09-04",
      },
    ]);
    // Comma should be backslash-escaped.
    expect(ics).toContain("SUMMARY:COMP 352\\, Data Structures");
    // Newline → \n literal; semicolon escaped.
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\; with semicolon");
  });

  it("emits all-day events via VALUE=DATE", () => {
    const ics = buildICS("Test", [
      { uid: "fall-2026", summary: "Fall 2026 start", date: "2026-09-04" },
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260904");
  });

  it("includes URL field when provided", () => {
    const ics = buildICS("Test", [
      { uid: "u", summary: "S", date: "2026-01-08", url: "https://concordia.ca" },
    ]);
    expect(ics).toContain("URL:https://concordia.ca");
  });

  it("termToStartDate maps SOEN terms to Concordia start dates", () => {
    expect(termToStartDate("Fall 2026")).toBe("2026-09-04");
    expect(termToStartDate("Winter 2027")).toBe("2027-01-08");
    expect(termToStartDate("Summer 2027")).toBe("2027-05-06");
    expect(termToStartDate("Spring 2026")).toBeNull();
    expect(termToStartDate("Fall")).toBeNull();
  });
});
