"use server";

import { db } from "@/lib/db";
import { userCourses } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const moveSchema = z.object({
  userCourseId: z.string().uuid(),
  toTerm: z.string().regex(/^(Fall|Winter|Summer)\s+\d{4}$/, "Term must look like 'Fall 2026'"),
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
  const year = Number(toTerm.match(/(\d{4})/)?.[1] ?? 0);

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
