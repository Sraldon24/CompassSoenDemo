/**
 * Live integration test for the Concordia calendar scraper.
 *
 * Hits the real Concordia URL — verifies the parser still works against the
 * current HTML structure. If Concordia rewrites their page templates, this
 * test goes red BEFORE the cron silently breaks in production.
 *
 * Skipped if SKIP_LIVE_NETWORK is set (e.g. in offline CI).
 */

import { parseConcordiaCalendar } from "@/lib/scraping/concordia";
import { describe, expect, it } from "vitest";

const LIVE_URL =
  "https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-gina-cody-school-of-engineering-and-computer-science/section-71-70-department-of-computer-science-and-software-engineering/section-71-70-10-computer-science-and-software-engineering-courses.html";

const SHOULD_RUN = !process.env.SKIP_LIVE_NETWORK;

describe.skipIf(!SHOULD_RUN)("Concordia parser against live HTML", () => {
  it("extracts at least 50 courses from §71.70.10 (canary against HTML drift)", async () => {
    const res = await fetch(LIVE_URL, {
      headers: { "User-Agent": "SOEN-Compass-Bot/1.0 (test)" },
    });
    expect(res.ok).toBe(true);
    const html = await res.text();

    const courses = parseConcordiaCalendar(html);
    expect(courses.length).toBeGreaterThan(50);

    // Spot-check known courses.
    const codes = new Set(courses.map((c) => c.code));
    expect(codes.has("COMP 248")).toBe(true);
    expect(codes.has("COMP 352")).toBe(true);
    expect(codes.has("COMP 472")).toBe(true);
    expect(codes.has("SOEN 287")).toBe(true);
  }, 30_000);

  it("every parsed course has non-empty title + valid credits", async () => {
    const res = await fetch(LIVE_URL, {
      headers: { "User-Agent": "SOEN-Compass-Bot/1.0 (test)" },
    });
    const html = await res.text();
    const courses = parseConcordiaCalendar(html);

    for (const c of courses) {
      expect(c.code).toMatch(/^[A-Z]{3,4}\s\d{3,4}[A-Z]?$/);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.credits).toBeGreaterThan(0);
      expect(c.credits).toBeLessThanOrEqual(12);
    }
  }, 30_000);
});
