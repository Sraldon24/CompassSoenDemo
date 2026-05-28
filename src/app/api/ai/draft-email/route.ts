import { runEmailDraftGraph } from "@/lib/ai/graphs/email-graph";
import { recordAIUsage } from "@/lib/ai/usage";
import { getSession } from "@/lib/get-session";
import { LIMITS, rateLimitByUserId } from "@/lib/rate-limit";
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

  const limit = rateLimitByUserId(
    session.user.id,
    "ai-draft-email",
    LIMITS.aiDraftEmail.limit,
    LIMITS.aiDraftEmail.windowMs,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Daily email-drafting limit reached." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const result = await runEmailDraftGraph({
      situation: parsed.situation,
      recipientRole: parsed.recipientRole,
    });
    // Estimate tokens across both LLM passes (draft + revise).
    const totalTokens = Math.ceil((result.firstDraft.length + result.draft.length) / 4);
    await recordAIUsage({
      userId: session.user.id,
      feature: "email-draft",
      model: "llama-3.3-70b-versatile",
      tokensUsed: totalTokens,
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
