import { runRecommendationGraph } from "@/lib/ai/graphs/recommend-graph";
import { getSession } from "@/lib/get-session";
import { denyResponse, guardAiCall, withUsage } from "@/lib/limits";
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

  const decision = guardAiCall({
    feature: "aiRecommend",
    identity: { kind: "user", id: session.user.id },
    model: "llama-3.3-70b-versatile",
  });
  if (!decision.allowed) return denyResponse(decision);

  try {
    const recs = await withUsage(
      {
        userId: session.user.id,
        feature: "recommend",
        model: "llama-3.3-70b-versatile",
        // Estimate from actual response sizes (one token ≈ 4 chars). The "why"
        // strings are the only LLM-generated output; the rest is deterministic.
        estimateTokens: (r) => (r ?? []).reduce((sum, x) => sum + Math.ceil(x.why.length / 4), 0),
      },
      () =>
        runRecommendationGraph({
          userId: session.user.id,
          interests: parsed.interests,
          categoryFilter: parsed.categoryFilter,
        }),
    );
    return NextResponse.json({ recommendations: recs });
  } catch (err) {
    console.error("[ai] recommend failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recommendation failed" },
      { status: 503 },
    );
  }
}
