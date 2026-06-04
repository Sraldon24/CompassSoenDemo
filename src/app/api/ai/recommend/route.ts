import { runRecommendationGraph } from "@/lib/ai/graphs/recommend-graph";
import { apiOk } from "@/lib/api/response";
import { aiGuard } from "@/lib/api/route-guard";
import { runAiUsage } from "@/lib/limits";
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
  const guard = await aiGuard(req, requestSchema, "aiRecommend", "llama-3.3-70b-versatile");
  if (!guard.ok) return guard.response;
  const { session, body } = guard;

  const run = await runAiUsage(
    {
      userId: session.user.id,
      feature: "recommend",
      model: "llama-3.3-70b-versatile",
      // Estimate from actual response sizes (one token ≈ 4 chars). The "why"
      // strings are the only LLM-generated output; the rest is deterministic.
      estimateTokens: (r) => (r ?? []).reduce((sum, x) => sum + Math.ceil(x.why.length / 4), 0),
    },
    "Recommendation failed",
    () =>
      runRecommendationGraph({
        userId: session.user.id,
        interests: body.interests,
        categoryFilter: body.categoryFilter,
      }),
  );
  if (!run.ok) return run.response;

  return apiOk({ recommendations: run.data });
}
