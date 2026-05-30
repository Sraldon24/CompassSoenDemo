"use server";

/**
 * Server actions for the admin moderation queue.
 */

import { type ResolveAction, resolveFlag } from "@/lib/community/moderation";
import { getSession } from "@/lib/get-session";
import { isAdmin } from "@/lib/is-admin";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function resolveFlagAction(
  flagId: string,
  action: ResolveAction,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return { ok: false, error: "unauthorized" };
  }
  try {
    const result = await resolveFlag(flagId, action, session.user.id);
    if (!result.resolved) return { ok: false, error: "flag not found or already resolved" };
    revalidatePath("/admin/moderation");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}
