import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_INSIGHT_SYSTEM } from "@/lib/ai/prompts";
import { AIError, generateResponse } from "@/lib/ai/provider";
import { recordAIUsage } from "@/lib/ai/usage";
import { getUserPlanSnapshot } from "@/lib/db/queries/plan";
import { LRUCache } from "lru-cache";
import { Sparkles } from "lucide-react";

// One-day per-user insight cache so we don't burn Groq quota on every dashboard hit.
const insightCache = new LRUCache<string, { text: string; expires: number }>({
  max: 5_000,
  ttl: 1000 * 60 * 60 * 24,
});

async function getOrGenerateInsight(userId: string): Promise<string> {
  const cached = insightCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.text;

  const { userPlan, catalog } = await getUserPlanSnapshot(userId);

  if (userPlan.length === 0) {
    return "Your plan is empty. Start by adding Fall 2026 courses on the My Plan page — even rough placeholders unlock prereq checks and workload estimates.";
  }

  // Build a tiny snapshot the LLM can reason over.
  const planSummary = userPlan
    .map((p) => {
      const c = catalog.get(p.courseCode);
      return `${p.courseCode} (${c?.credits ?? "?"}cr, ${c?.category ?? "?"}, ${p.status}, ${p.term})`;
    })
    .slice(0, 25)
    .join("\n");

  try {
    const { text } = await generateResponse({
      task: "dashboard-insight",
      system: DASHBOARD_INSIGHT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Today's plan snapshot:\n${planSummary}\n\nWrite one short insight paragraph for this student.`,
        },
      ],
      temperature: 0.5,
      maxTokens: 200,
    });
    insightCache.set(userId, { text, expires: Date.now() + 1000 * 60 * 60 * 24 });
    // Fire-and-forget usage tracking.
    recordAIUsage({
      userId,
      feature: "dashboard-insight",
      model: "llama-3.3-70b-versatile",
      tokensUsed: Math.ceil(text.length / 4),
    }).catch(() => {});
    return text;
  } catch (err) {
    if (err instanceof AIError) {
      return "Compass is briefly unavailable. Check back in a few minutes — your plan and validation still work.";
    }
    throw err;
  }
}

export async function AIInsightWidget({ userId }: { userId: string }): Promise<React.ReactElement> {
  const insight = await getOrGenerateInsight(userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          AI Insight of the Day
        </CardTitle>
        <CardDescription>Refreshes daily. Powered by Groq Llama 3.3 70B.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
          {insight}
        </p>
      </CardContent>
    </Card>
  );
}
