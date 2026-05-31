"use server";

import { db } from "@/lib/db";
import { courses, userCourses } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { TERM_REGEX, termYear } from "@/lib/term";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const moveSchema = z.object({
  userCourseId: z.string().uuid(),
  toTerm: z.string().regex(TERM_REGEX, "Term must look like 'Fall 2026'"),
});

const COURSE_CODE_RX = /^[A-Z]{3,4}\s\d{3,4}[A-Z]?$/;

const addSchema = z.object({
  courseCode: z.string().regex(COURSE_CODE_RX, "Invalid course code"),
  term: z.string().regex(TERM_REGEX, "Term must look like 'Fall 2026'"),
});

const removeSchema = z.object({
  userCourseId: z.string().uuid(),
});

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function moveCourseToTerm(input: {
  userCourseId: string;
  toTerm: string;
}): Promise<ActionResult<{ id: string; term: string }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { userCourseId, toTerm } = parsed.data;
  const year = termYear(toTerm);

  const [updated] = await db
    .update(userCourses)
    .set({ term: toTerm, year, updatedAt: new Date() })
    .where(and(eq(userCourses.id, userCourseId), eq(userCourses.userId, session.user.id)))
    .returning({ id: userCourses.id, term: userCourses.term });

  if (!updated) {
    return { success: false, error: "Course not found or not owned by you" };
  }

  revalidatePath("/plan");
  return { success: true, data: { id: updated.id, term: updated.term ?? toTerm } };
}

/** Add a course from the catalog to the user's plan in a given term. */
export async function addCourseToPlan(input: {
  courseCode: string;
  term: string;
}): Promise<ActionResult<{ id: string; courseCode: string; term: string }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { courseCode, term } = parsed.data;

  // The course must exist in the catalog.
  const [course] = await db
    .select({ code: courses.code })
    .from(courses)
    .where(eq(courses.code, courseCode));
  if (!course) return { success: false, error: `${courseCode} is not in the catalog` };

  // Don't add a course already in the plan (any term/status).
  const existing = await db
    .select({ id: userCourses.id })
    .from(userCourses)
    .where(and(eq(userCourses.userId, session.user.id), eq(userCourses.courseCode, courseCode)));
  if (existing[0]) {
    return { success: false, error: `${courseCode} is already in your plan` };
  }

  const [inserted] = await db
    .insert(userCourses)
    .values({
      userId: session.user.id,
      courseCode,
      term,
      year: termYear(term),
      status: "planned",
    })
    .returning({ id: userCourses.id });

  if (!inserted) return { success: false, error: "Could not add course" };

  revalidatePath("/plan");
  return { success: true, data: { id: inserted.id, courseCode, term } };
}

/** Remove a planned course from the user's plan. */
export async function removeCourseFromPlan(input: {
  userCourseId: string;
}): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [deleted] = await db
    .delete(userCourses)
    .where(
      and(eq(userCourses.id, parsed.data.userCourseId), eq(userCourses.userId, session.user.id)),
    )
    .returning({ id: userCourses.id });

  if (!deleted) return { success: false, error: "Course not found or not owned by you" };

  revalidatePath("/plan");
  return { success: true, data: { id: deleted.id } };
}
