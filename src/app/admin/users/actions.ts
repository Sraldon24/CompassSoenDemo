"use server";

import { getSession } from "@/lib/auth/get-session";
import { isAdmin } from "@/lib/auth/is-admin";
import { db } from "@/lib/data/db";
import { users } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type ActionResult = { success: true } | { success: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const session = await getSession();
  if (!session || !isAdmin(session)) return null;
  return session.user.id;
}

/** Approve or reject a user's invite-only access request. */
export async function setUserStatus(input: {
  userId: string;
  status: "approved" | "rejected" | "pending";
}): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { success: false, error: "Not authorized" };

  if (!["approved", "rejected", "pending"].includes(input.status)) {
    return { success: false, error: "Invalid status" };
  }
  // Don't let an admin lock themselves out.
  if (input.userId === adminId && input.status !== "approved") {
    return { success: false, error: "You can't change your own access." };
  }

  const [updated] = await db
    .update(users)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(users.id, input.userId))
    .returning({ id: users.id });

  if (!updated) return { success: false, error: "User not found" };

  revalidatePath("/admin/users");
  return { success: true };
}
