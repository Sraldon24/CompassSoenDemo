/**
 * Public profile data access.
 *
 * A profile is only visible when `isPublic = true` AND it has a `publicSlug`.
 * The slug is the lookup key for /u/[slug]. We respect the per-field privacy
 * toggles (showGpa, showDeficiencies, showFuturePlan) so users control exactly
 * what a no-auth visitor sees.
 */

import { db } from "@/lib/db";
import { courses, profiles, userCourses, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export interface PublicProfile {
  slug: string;
  displayName: string;
  program: string | null;
  bio: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  /** Completed/transferred courses (always shown). */
  completed: PublicCourse[];
  /** Planned/enrolled future courses — only when showFuturePlan. */
  planned: PublicCourse[];
  /** Total credits earned from completed+transferred. */
  creditsEarned: number;
  showFuturePlan: boolean;
}

export interface PublicCourse {
  code: string;
  title: string;
  credits: number;
  term: string | null;
  status: string;
}

const EARNED_STATUSES = new Set(["completed", "transferred"]);
const PLANNED_STATUSES = new Set(["planned", "enrolled"]);

export async function getPublicProfileBySlug(slug: string): Promise<PublicProfile | null> {
  const profileRows = await db
    .select({
      userId: profiles.userId,
      program: profiles.program,
      bio: profiles.bio,
      githubUrl: profiles.githubUrl,
      linkedinUrl: profiles.linkedinUrl,
      showFuturePlan: profiles.showFuturePlan,
      isPublic: profiles.isPublic,
      name: users.name,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(and(eq(profiles.publicSlug, slug), eq(profiles.isPublic, true)));

  const profile = profileRows[0];
  if (!profile) return null;

  const courseRows = await db
    .select({
      code: userCourses.courseCode,
      title: courses.title,
      credits: courses.credits,
      term: userCourses.term,
      status: userCourses.status,
    })
    .from(userCourses)
    .innerJoin(courses, eq(userCourses.courseCode, courses.code))
    .where(eq(userCourses.userId, profile.userId));

  const completed: PublicCourse[] = [];
  const planned: PublicCourse[] = [];
  let creditsEarned = 0;

  for (const c of courseRows) {
    const entry: PublicCourse = {
      code: c.code,
      title: c.title,
      credits: c.credits,
      term: c.term,
      status: c.status,
    };
    if (EARNED_STATUSES.has(c.status)) {
      completed.push(entry);
      creditsEarned += c.credits;
    } else if (PLANNED_STATUSES.has(c.status) && profile.showFuturePlan) {
      planned.push(entry);
    }
  }

  return {
    slug,
    displayName: profile.name ?? "Concordia student",
    program: profile.program,
    bio: profile.bio,
    githubUrl: profile.githubUrl,
    linkedinUrl: profile.linkedinUrl,
    completed: completed.sort(byTermThenCode),
    planned: planned.sort(byTermThenCode),
    creditsEarned,
    showFuturePlan: profile.showFuturePlan,
  };
}

function byTermThenCode(a: PublicCourse, b: PublicCourse): number {
  const t = (a.term ?? "").localeCompare(b.term ?? "");
  return t !== 0 ? t : a.code.localeCompare(b.code);
}
