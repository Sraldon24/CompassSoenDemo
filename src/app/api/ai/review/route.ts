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

import { generateResponse } from "@/lib/ai/provider";
import { getAllCourses, getUserPlanSnapshot } from "@/lib/db/queries/plan";
import { getSession } from "@/lib/get-session";
import { denyResponse, guardAiCall, withUsage } from "@/lib/limits";
import { buildPlan, validatePlan } from "@/lib/validation/plan";
import { NextResponse } from "next/server";

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

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const decision = guardAiCall({
    feature: "aiReview",
    identity: { kind: "user", id: session.user.id },
    model: "llama-3.3-70b-versatile",
  });
  if (!decision.allowed) return denyResponse(decision);

  const [{ userPlan }, catalogList] = await Promise.all([
    getUserPlanSnapshot(session.user.id),
    getAllCourses(),
  ]);
  const catalog = new Map(catalogList.map((c) => [c.code, c]));

  if (userPlan.length === 0) {
    return NextResponse.json({
      suggestions: [
        {
          kind: "elective",
          title: "Your plan is empty — add a few courses or import your transcript.",
          detail: "Once there are courses to look at, I'll suggest workload and sequencing tweaks.",
        },
      ] satisfies ReviewSuggestion[],
      remaining: decision.remaining,
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

  try {
    const result = await withUsage(
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
    return NextResponse.json({ suggestions: result, remaining: decision.remaining });
  } catch (err) {
    console.error("[ai] review failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI Review unavailable" },
      { status: 503 },
    );
  }
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
