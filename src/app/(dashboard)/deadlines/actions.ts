"use server";

import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { checklistItems } from "@/lib/data/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const addSchema = z.object({
  task: z.string().trim().min(1, "Enter a task").max(200),
  notes: z.string().trim().max(500).optional(),
});

/** Add a manual checklist item (e.g. the English Writing Test) to /deadlines. */
export async function addChecklistItem(input: {
  task: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [inserted] = await db
    .insert(checklistItems)
    .values({
      userId: session.user.id,
      task: parsed.data.task,
      notes: parsed.data.notes || null,
      category: "Manual milestone",
    })
    .returning({ id: checklistItems.id });

  if (!inserted) return { success: false, error: "Could not add item" };

  revalidatePath("/deadlines");
  return { success: true, data: { id: inserted.id } };
}

/** Toggle a checklist item's completed state. */
export async function toggleChecklistItem(input: {
  id: string;
  completed: boolean;
}): Promise<ActionResult<{ id: string; completed: boolean }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { success: false, error: "Invalid id" };

  const [updated] = await db
    .update(checklistItems)
    .set({
      completed: input.completed,
      completedAt: input.completed ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(checklistItems.id, id.data), eq(checklistItems.userId, session.user.id)))
    .returning({ id: checklistItems.id, completed: checklistItems.completed });

  if (!updated) return { success: false, error: "Item not found" };

  revalidatePath("/deadlines");
  return { success: true, data: { id: updated.id, completed: updated.completed } };
}

/** Remove a checklist item. */
export async function removeChecklistItem(input: {
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { success: false, error: "Invalid id" };

  const [deleted] = await db
    .delete(checklistItems)
    .where(and(eq(checklistItems.id, id.data), eq(checklistItems.userId, session.user.id)))
    .returning({ id: checklistItems.id });

  if (!deleted) return { success: false, error: "Item not found" };

  revalidatePath("/deadlines");
  return { success: true, data: { id: deleted.id } };
}
