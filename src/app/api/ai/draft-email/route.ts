import { runEmailDraftGraph } from "@/lib/ai/graphs/email-graph";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { getSession } from "@/lib/get-session";
import { denyResponse, guardAiCall, withUsage } from "@/lib/limits";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  situation: z.string().trim().min(10).max(1500),
  recipientRole: z.enum(["advisor", "professor", "coop-office", "department", "other"]),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof z.ZodError ? err.issues[0]?.message : "Bad request" },
      { status: 400 },
    );
  }

  const decision = guardAiCall({
    feature: "aiDraftEmail",
    identity: { kind: "user", id: session.user.id },
    model: "llama-3.3-70b-versatile",
  });
  if (!decision.allowed) return denyResponse(decision);

  try {
    const result = await withUsage(
      {
        userId: session.user.id,
        feature: "email-draft",
        model: "llama-3.3-70b-versatile",
        // Estimate tokens across both LLM passes (draft + revise).
        estimateTokens: (r) => (r ? Math.ceil((r.firstDraft.length + r.draft.length) / 4) : 0),
      },
      () =>
        runEmailDraftGraph({
          situation: parsed.situation,
          recipientRole: parsed.recipientRole,
        }),
    );
    void trackServer(session.user.id, ANALYTICS_EVENTS.email_drafted, {
      recipientRole: parsed.recipientRole,
    });
    return NextResponse.json({ draft: result.draft });
  } catch (err) {
    console.error("[ai] draft-email failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drafting failed" },
      { status: 503 },
    );
  }
}
