import { runEmailDraftGraph } from "@/lib/ai/graphs/email-graph";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { apiOk } from "@/lib/api/response";
import { aiGuard } from "@/lib/api/route-guard";
import { runAiUsage } from "@/lib/limits";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  situation: z.string().trim().min(10).max(1500),
  recipientRole: z.enum(["advisor", "professor", "coop-office", "department", "other"]),
});

export async function POST(req: Request): Promise<Response> {
  const guard = await aiGuard(req, requestSchema, "aiDraftEmail", "llama-3.3-70b-versatile");
  if (!guard.ok) return guard.response;
  const { session, body } = guard;

  const run = await runAiUsage(
    {
      userId: session.user.id,
      feature: "email-draft",
      model: "llama-3.3-70b-versatile",
      // Estimate tokens across both LLM passes (draft + revise).
      estimateTokens: (r) => (r ? Math.ceil((r.firstDraft.length + r.draft.length) / 4) : 0),
    },
    "Drafting failed",
    () =>
      runEmailDraftGraph({
        situation: body.situation,
        recipientRole: body.recipientRole,
      }),
  );
  if (!run.ok) return run.response;

  void trackServer(session.user.id, ANALYTICS_EVENTS.email_drafted, {
    recipientRole: body.recipientRole,
  });
  return apiOk({ draft: run.data.draft });
}
