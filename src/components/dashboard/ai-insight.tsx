import { Badge } from "@/components/ui/badge";
import { DASHBOARD_INSIGHT_SYSTEM } from "@/lib/ai/prompts";
import { AIError, generateResponse } from "@/lib/ai/provider";
import { recordAIUsage } from "@/lib/ai/usage";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { LRUCache } from "lru-cache";
import { RefreshCw, Sparkles } from "lucide-react";

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
    <div
      className="card card-hard animate-rise relative overflow-hidden px-[26px] py-6"
      style={{
        background: "linear-gradient(120deg, var(--accent-soft), transparent 70%)",
        borderColor: "color-mix(in oklch, var(--accent) 34%, transparent)",
      }}
    >
      {/* Rotated compass watermark */}
      <div
        className="pointer-events-none absolute -right-7 -top-7 rotate-[8deg] opacity-[0.1]"
        style={{ color: "var(--accent)" }}
        aria-hidden
      >
        <svg
          width={150}
          height={150}
          viewBox="0 0 40 40"
          fill="none"
          role="img"
          aria-label="Compass watermark"
        >
          <circle cx="20" cy="20" r="18" fill="currentColor" />
          <path d="M20 8 L24 20 L20 32 L16 20 Z" fill="var(--on-accent)" opacity="0.95" />
          <path d="M20 8 L24 20 L20 20 Z" fill="var(--ink)" opacity="0.35" />
          <circle cx="20" cy="20" r="2.2" fill="var(--ink)" />
        </svg>
      </div>
      <div className="relative mb-3 flex items-center gap-2.5">
        <span
          className="inline-grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          <Sparkles className="h-[17px] w-[17px]" aria-hidden />
        </span>
        <span className="eyebrow" style={{ color: "var(--accent-deep)" }}>
          Insight of the day
        </span>
        <Badge variant="secondary" className="ml-auto gap-1">
          <RefreshCw className="size-3" aria-hidden />
          Daily
        </Badge>
      </div>
      <p
        className="relative max-w-[760px] font-heading text-[17.5px] font-medium leading-[1.5] tracking-[-0.01em]"
        style={{ color: "var(--color-text)" }}
      >
        {insight}
      </p>
      <p className="relative mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
        Refreshes daily. Powered by Groq Llama 3.3 70B.
      </p>
    </div>
  );
}
