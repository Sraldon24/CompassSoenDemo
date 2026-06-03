"use server";

import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { courses, userCourses } from "@/lib/data/schema";
import { TERM_REGEX, termYear } from "@/lib/domain/term";
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

const setStatusSchema = z.object({
  userCourseId: z.string().uuid(),
  // Only the two transitions this UI needs: into the Transfer lane, or back
  // into a normal term as a planned course.
  status: z.enum(["transferred", "planned"]),
  // Required when moving back out of the transfer lane (transfers have no term).
  term: z.string().regex(TERM_REGEX, "Term must look like 'Fall 2026'").optional(),
});

const addTransferSchema = z.object({
  courseCode: z.string().regex(COURSE_CODE_RX, "Invalid course code"),
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

/**
 * Mark a course as a transferred (CEGEP / advanced-standing) credit, or move it
 * back into a normal term as planned. Transfers live in the planner's Transfer
 * lane and carry no Concordia term, so we blank the term when transferring.
 */
export async function setCourseStatus(input: {
  userCourseId: string;
  status: "transferred" | "planned";
  term?: string;
}): Promise<ActionResult<{ id: string; status: "transferred" | "planned"; term: string | null }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { userCourseId, status, term } = parsed.data;

  // Transferred credits have no term; moving back to "planned" needs one.
  if (status === "planned" && !term) {
    return { success: false, error: "A term is required to move a transfer back into the plan" };
  }
  const nextTerm = status === "transferred" ? null : (term ?? null);

  const [updated] = await db
    .update(userCourses)
    .set({
      status,
      term: nextTerm,
      year: nextTerm ? termYear(nextTerm) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(userCourses.id, userCourseId), eq(userCourses.userId, session.user.id)))
    .returning({ id: userCourses.id, status: userCourses.status, term: userCourses.term });

  if (!updated) return { success: false, error: "Course not found or not owned by you" };

  revalidatePath("/plan");
  return {
    success: true,
    data: { id: updated.id, status: status, term: updated.term ?? null },
  };
}

/** Add a catalog course directly as a transferred credit (no term). */
export async function addTransferCredit(input: {
  courseCode: string;
}): Promise<ActionResult<{ id: string; courseCode: string }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = addTransferSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { courseCode } = parsed.data;

  const [course] = await db
    .select({ code: courses.code })
    .from(courses)
    .where(eq(courses.code, courseCode));
  if (!course) return { success: false, error: `${courseCode} is not in the catalog` };

  const existing = await db
    .select({ id: userCourses.id })
    .from(userCourses)
    .where(and(eq(userCourses.userId, session.user.id), eq(userCourses.courseCode, courseCode)));
  if (existing[0]) {
    return { success: false, error: `${courseCode} is already in your plan` };
  }

  const [inserted] = await db
    .insert(userCourses)
    .values({ userId: session.user.id, courseCode, term: null, year: null, status: "transferred" })
    .returning({ id: userCourses.id });

  if (!inserted) return { success: false, error: "Could not add transfer credit" };

  revalidatePath("/plan");
  return { success: true, data: { id: inserted.id, courseCode } };
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
