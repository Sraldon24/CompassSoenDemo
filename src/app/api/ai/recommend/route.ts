import { runRecommendationGraph } from "@/lib/ai/graphs/recommend-graph";
import { recordAIUsage } from "@/lib/ai/usage";
import { getSession } from "@/lib/get-session";
import { LIMITS, rateLimitByUserId } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  interests: z.array(z.string()).optional(),
  categoryFilter: z
    .array(
      z.enum([
        "eng_core",
        "se_core",
        "eng_nsci_group",
        "nat_sci_elective",
        "soen_elective",
        "gen_ed_humanities",
        "deficiency",
      ]),
    )
    .optional(),
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
    "ai-recommend",
    LIMITS.aiRecommend.limit,
    LIMITS.aiRecommend.windowMs,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Daily recommendation limit reached." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const recs = await runRecommendationGraph({
      userId: session.user.id,
      interests: parsed.interests,
      categoryFilter: parsed.categoryFilter,
    });
    // H4 fix: estimate from actual response sizes (one token ≈ 4 chars).
    // The "why" strings are the only LLM-generated output; the rest is deterministic.
    const tokensUsed = recs.reduce((sum, r) => sum + Math.ceil(r.why.length / 4), 0);
    await recordAIUsage({
      userId: session.user.id,
      feature: "recommend",
      model: "llama-3.3-70b-versatile",
      tokensUsed,
    });
    return NextResponse.json({ recommendations: recs });
  } catch (err) {
    console.error("[ai] recommend failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recommendation failed" },
      { status: 503 },
    );
  }
}
