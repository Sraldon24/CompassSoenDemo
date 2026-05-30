/**
 * POST /api/moderation/flag — flag a piece of community content for review.
 *
 * Any logged-in user can flag. Flagging immediately hides the target pending
 * admin review (see lib/community/moderation.ts). Rate-limited so one user
 * can't mass-flag the board.
 */

import { authLimitGuard } from "@/lib/api/route-guard";
import { type FlaggableEntity, flagEntity } from "@/lib/community/moderation";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  entityType: z.literal("professor_review"),
  entityId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await authLimitGuard("moderationFlag");
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await flagEntity({
      reporterId: session.user.id,
      entityType: parsed.entityType as FlaggableEntity,
      entityId: parsed.entityId,
      reason: parsed.reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[moderation] flag failed:", err);
    return NextResponse.json({ error: "flag_failed" }, { status: 500 });
  }
}
