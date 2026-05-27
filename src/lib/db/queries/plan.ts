/**
 * Plan-related DB queries.
 *
 * Server Component-safe (uses Drizzle's `db` directly). Each function returns
 * data shaped for the planner UI.
 */

import { db } from "@/lib/db";
import { courses, userCourses } from "@/lib/db/schema";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { asc, eq, sql } from "drizzle-orm";

export interface UserPlanSnapshot {
  userPlan: PlannedCourse[];
  catalog: Map<string, CourseCatalogEntry>;
}

/**
 * Fetch a user's entire planned + enrolled + completed course list, plus the
 * course catalog entries for everything they reference. One round-trip would
 * be ideal, but we keep two simple queries here for readability.
 */
export async function getUserPlanSnapshot(userId: string): Promise<UserPlanSnapshot> {
  const userRows = await db
    .select({
      courseCode: userCourses.courseCode,
      term: userCourses.term,
      status: userCourses.status,
      isDeficiency: userCourses.isDeficiency,
    })
    .from(userCourses)
    .where(eq(userCourses.userId, userId))
    .orderBy(asc(userCourses.term), asc(userCourses.courseCode));

  const userPlan: PlannedCourse[] = userRows.map((r) => ({
    courseCode: r.courseCode,
    term: r.term ?? "",
    status: r.status,
    isDeficiency: r.isDeficiency ?? false,
  }));

  // Fetch every course the user references, but cap the query if they have
  // more than ~200 entries (unlikely v1 case).
  const codes = [...new Set(userPlan.map((p) => p.courseCode))];
  const catalogRows = codes.length
    ? await db
        .select({
          code: courses.code,
          title: courses.title,
          credits: courses.credits,
          category: courses.category,
          prereqs: courses.prereqs,
          offeredFall: courses.offeredFall,
          offeredWinter: courses.offeredWinter,
          offeredSummer: courses.offeredSummer,
          avgHoursPerWeek: courses.avgHoursPerWeek,
        })
        .from(courses)
        .where(sql`${courses.code} = ANY(${codes})`)
    : [];

  const catalog = new Map<string, CourseCatalogEntry>();
  for (const r of catalogRows) {
    catalog.set(r.code, {
      code: r.code,
      title: r.title,
      credits: r.credits,
      category: r.category ?? null,
      prereqs: (r.prereqs as CourseCatalogEntry["prereqs"]) ?? undefined,
      offeredFall: r.offeredFall ?? true,
      offeredWinter: r.offeredWinter ?? true,
      offeredSummer: r.offeredSummer ?? false,
      avgHoursPerWeek: r.avgHoursPerWeek ?? undefined,
    });
  }

  return { userPlan, catalog };
}

/** Get the full course catalog — used by /plan to populate the "+ Add" picker. */
export async function getAllCourses(): Promise<CourseCatalogEntry[]> {
  const rows = await db
    .select({
      code: courses.code,
      title: courses.title,
      credits: courses.credits,
      category: courses.category,
      prereqs: courses.prereqs,
      offeredFall: courses.offeredFall,
      offeredWinter: courses.offeredWinter,
      offeredSummer: courses.offeredSummer,
      avgHoursPerWeek: courses.avgHoursPerWeek,
    })
    .from(courses)
    .orderBy(asc(courses.code));

  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    credits: r.credits,
    category: r.category ?? null,
    prereqs: (r.prereqs as CourseCatalogEntry["prereqs"]) ?? undefined,
    offeredFall: r.offeredFall ?? true,
    offeredWinter: r.offeredWinter ?? true,
    offeredSummer: r.offeredSummer ?? false,
    avgHoursPerWeek: r.avgHoursPerWeek ?? undefined,
  }));
}

/**
 * Returns a deterministic list of terms from start → end, e.g.
 * Fall 2026, Winter 2027, Summer 2027, Fall 2027, ...
 */
export function termRange(startTerm: string, endTerm: string): string[] {
  const seasons = ["Winter", "Summer", "Fall"] as const;
  const parse = (s: string): { season: (typeof seasons)[number]; year: number } | null => {
    const m = s.match(/^(Fall|Winter|Summer)\s+(\d{4})$/i);
    if (!m || !m[1] || !m[2]) return null;
    const seasonRaw = m[1].toLowerCase();
    const season = (seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1)) as
      | "Fall"
      | "Winter"
      | "Summer";
    return { season, year: Number(m[2]) };
  };
  const a = parse(startTerm);
  const b = parse(endTerm);
  if (!a || !b) return [];

  const ord = (x: { season: (typeof seasons)[number]; year: number }): number =>
    x.year * 3 + seasons.indexOf(x.season);

  const out: string[] = [];
  let cur = { ...a };
  while (ord(cur) <= ord(b)) {
    out.push(`${cur.season} ${cur.year}`);
    const idx = seasons.indexOf(cur.season);
    if (idx === seasons.length - 1) {
      cur = { season: "Winter", year: cur.year + 1 };
    } else {
      cur = { season: seasons[idx + 1] as (typeof seasons)[number], year: cur.year };
    }
  }
  return out;
}
