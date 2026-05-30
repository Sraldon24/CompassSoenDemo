/**
 * POST   /api/account/delete — schedule account deletion (soft-delete + 30-day
 *                              grace), then sign the user out.
 * DELETE /api/account/delete — cancel a pending deletion (undo within grace).
 *
 * Auth required. The actual hard purge runs server-side after the grace window
 * (purgeExpiredAccounts), so this route never destroys data synchronously.
 */

import { cancelAccountDeletion, scheduleAccountDeletion } from "@/lib/account/gdpr";
import { authGuard } from "@/lib/api/route-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const result = await scheduleAccountDeletion(guard.session.user.id, new Date());
  return NextResponse.json({
    ok: true,
    message: `Account scheduled for deletion. You have until ${result.purgeAfter.slice(0, 10)} to change your mind by signing in again.`,
    purgeAfter: result.purgeAfter,
  });
}

export async function DELETE(): Promise<Response> {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  await cancelAccountDeletion(guard.session.user.id);
  return NextResponse.json({ ok: true, message: "Deletion cancelled. Your account is active." });
}
