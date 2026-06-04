/**
 * GET /api/ai/review — proactive "AI Review" of the user's plan.
 *
 * One-shot, high-value, not-live: uses generateResponse (Groq 70B → Gemini →
 * 8B → OpenRouter fallback chain) for the best reasoning. The client calls this
 * once per page load and on an explicit Refresh, so it's rate-limited modestly.
 *
 * Returns 3-5 short, actionable suggestions grounded in the user's actual
 * courses + the deterministic prereq/workload issues — covering workload
 * balance, sequencing/prereqs, and elective ideas.
 */

import { createHash } from "node:crypto";
import { generateResponse } from "@/lib/ai/provider";
import { apiError, apiOk } from "@/lib/api/response";
import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { getAllCourses, getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { aiReviewCache } from "@/lib/data/schema";
import { denyResponse, guardAiCall, runAiUsage } from "@/lib/limits";
import { buildPlan, validatePlan } from "@/lib/validation/plan";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface ReviewSuggestion {
  /** workload | sequencing | elective — drives the chip/icon. */
  kind: "workload" | "sequencing" | "elective";
  /** One-line actionable headline. */
  title: string;
  /** Optional one-sentence rationale. */
  detail?: string;
}

const SYSTEM = `You are Compass, an academic advisor for Concordia BEng Software Engineering students.
Given a student's course plan and any detected issues, produce 3 to 5 SHORT, concrete, actionable suggestions.
Cover these angles when relevant: workload balance across terms, course sequencing / prerequisites, and good elective or next-course choices.
Be specific — name the course code and term. Don't repeat an issue verbatim; turn it into an action.
Respond with ONLY a JSON array (no prose, no markdown) of objects:
[{"kind":"workload"|"sequencing"|"elective","title":"<one line>","detail":"<one sentence, optional>"}]`;

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return apiError("Not authenticated", 401);

  // ?refresh=1 forces a fresh LLM pass (the Refresh button); otherwise we serve
  // a cached review when the plan hasn't changed — avoiding repeat token spend.
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  const [{ userPlan }, catalogList] = await Promise.all([
    getUserPlanSnapshot(session.user.id),
    getAllCourses(),
  ]);
  const catalog = new Map(catalogList.map((c) => [c.code, c]));

  if (userPlan.length === 0) {
    return apiOk({
      suggestions: [
        {
          kind: "elective",
          title: "Your plan is empty — add a few courses or import your transcript.",
          detail: "Once there are courses to look at, I'll suggest workload and sequencing tweaks.",
        },
      ] satisfies ReviewSuggestion[],
      cached: false,
    });
  }

  const plan = buildPlan(userPlan, catalogList);
  const issues = validatePlan(plan);

  // Compact, model-friendly description of the plan + issues.
  const byTerm = new Map<string, string[]>();
  for (const c of userPlan) {
    const key = c.status === "transferred" ? "Transfer credits" : c.term || "Unscheduled";
    const cr = catalog.get(c.courseCode)?.credits ?? 0;
    if (!byTerm.has(key)) byTerm.set(key, []);
    byTerm.get(key)?.push(`${c.courseCode} (${cr}cr, ${c.status})`);
  }
  const planText = [...byTerm.entries()]
    .map(([term, list]) => `${term}: ${list.join(", ")}`)
    .join("\n");
  const issuesText = issues.length
    ? issues
        .slice(0, 20)
        .map((i) => `- [${i.severity}] ${i.courseCode} ${i.term}: ${i.message}`)
        .join("\n")
    : "(no rule-based issues detected)";

  const userPrompt = `STUDENT PLAN (by term):\n${planText}\n\nDETECTED ISSUES:\n${issuesText}\n\nGive 3-5 suggestions as the JSON array described.`;

  // Cache key = hash of exactly what the model sees. Same plan+issues → cache hit.
  const planHash = createHash("sha256").update(userPrompt).digest("hex");

  if (!refresh) {
    const [hit] = await db
      .select({ planHash: aiReviewCache.planHash, suggestions: aiReviewCache.suggestions })
      .from(aiReviewCache)
      .where(eq(aiReviewCache.userId, session.user.id))
      .limit(1);
    if (hit && hit.planHash === planHash) {
      return apiOk({ suggestions: hit.suggestions, cached: true });
    }
  }

  // Cache miss (or refresh) → this is when we spend an LLM call, so rate-limit here.
  const decision = guardAiCall({
    feature: "aiReview",
    identity: { kind: "user", id: session.user.id },
    model: "llama-3.3-70b-versatile",
  });
  if (!decision.allowed) return denyResponse(decision);

  const run = await runAiUsage(
    {
      userId: session.user.id,
      feature: "recommend",
      model: "llama-3.3-70b-versatile",
      estimateTokens: (r) =>
        (r ?? []).reduce(
          (sum, s) => sum + Math.ceil((s.title.length + (s.detail?.length ?? 0)) / 4),
          0,
        ),
    },
    "AI Review unavailable",
    async () => {
      const res = await generateResponse({
        task: "recommend",
        system: SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.3,
        maxTokens: 600,
      });
      return parseSuggestions(res.text);
    },
  );
  if (!run.ok) return run.response;

  // Store for next time (one row per user; upsert on the plan hash).
  await db
    .insert(aiReviewCache)
    .values({ userId: session.user.id, planHash, suggestions: run.data })
    .onConflictDoUpdate({
      target: aiReviewCache.userId,
      set: { planHash, suggestions: run.data, generatedAt: new Date() },
    });

  return apiOk({ suggestions: run.data, remaining: decision.remaining, cached: false });
}

/** Extract the JSON array from the model output, tolerating stray prose/fences. */
function parseSuggestions(text: string): ReviewSuggestion[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown[];
    const valid: ReviewSuggestion[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const kind = o.kind === "workload" || o.kind === "sequencing" ? o.kind : "elective";
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) continue;
      const detail = typeof o.detail === "string" && o.detail.trim() ? o.detail.trim() : undefined;
      valid.push({ kind, title, detail });
      if (valid.length >= 5) break;
    }
    return valid;
  } catch {
    return [];
  }
}
