"use server";

/**
 * Server actions for the admin scraped-changes review UI.
 *
 * Approving a change writes the new value to the live `courses` table inside
 * a transaction with the status flip, so we never end up with an "approved"
 * change row but the actual courses row out of sync (or vice versa).
 *
 * Rejecting just flips status to "rejected" — no DB mutation outside the
 * scraped_changes row itself. Both actions are idempotent: re-running an
 * already-resolved change does nothing.
 */

import { getSession } from "@/lib/auth/get-session";
import { isAdmin } from "@/lib/auth/is-admin";
import { db } from "@/lib/data/db";
import { scrapedChanges } from "@/lib/data/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { applyCourseChange } from "./apply";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<{ userId: string } | ActionResult> {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return { ok: false, error: "unauthorized" };
  }
  return { userId: session.user.id };
}

export async function approveChange(changeId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("ok" in auth) return auth;

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(scrapedChanges)
        .where(and(eq(scrapedChanges.id, changeId), eq(scrapedChanges.status, "pending")));
      const change = rows[0];
      if (!change) throw new Error("change not found or already resolved");

      if (change.entityType !== "course") {
        throw new Error(`unsupported entityType: ${change.entityType}`);
      }
      await applyCourseChange(tx, change);

      await tx
        .update(scrapedChanges)
        .set({
          status: "approved",
          reviewedBy: auth.userId,
          reviewedAt: new Date(),
        })
        .where(eq(scrapedChanges.id, changeId));
    });
    revalidatePath("/admin/scraped-changes");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function rejectChange(changeId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("ok" in auth) return auth;

  try {
    await db
      .update(scrapedChanges)
      .set({
        status: "rejected",
        reviewedBy: auth.userId,
        reviewedAt: new Date(),
      })
      .where(and(eq(scrapedChanges.id, changeId), eq(scrapedChanges.status, "pending")));
    revalidatePath("/admin/scraped-changes");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}
