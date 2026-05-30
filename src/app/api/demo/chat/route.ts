/**
 * POST /api/demo/chat — no-auth AI taste-test for /demo.
 *
 * The client enforces a 5-message session cap; this route enforces a per-IP
 * daily cap as the real backstop (sessionStorage is trivially bypassed).
 * Answers are constrained to the static demo plan so we don't leak general
 * Groq capacity to anonymous traffic.
 */

import { generateResponse } from "@/lib/ai/provider";
import { DEMO_AI_MESSAGE_CAP, DEMO_PLAN } from "@/lib/demo/sample-plan";
import { rateLimitByIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ message: z.string().trim().min(1).max(500) });

const DEMO_SYSTEM = `You are Compass, a friendly AI advisor for Concordia BEng Software Engineering students, answering in a public DEMO.

The user is viewing this SAMPLE plan (you may reference it):
${DEMO_PLAN.map((p) => `- ${p.courseCode} (${p.term}, ${p.status})`).join("\n")}

Rules:
- Keep answers under 100 words.
- Be concrete and helpful about course sequencing / prerequisites.
- If asked something requiring their real transcript, invite them to sign up.
- Never invent Concordia policies you're unsure about.`;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "demo-anon";
}

export async function POST(req: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Per-IP daily backstop — generous enough for a genuine try, tight enough
  // that anon traffic can't drain the Groq budget.
  const limit = rateLimitByIp(
    clientIp(req),
    "demoChat",
    DEMO_AI_MESSAGE_CAP * 4,
    24 * 60 * 60 * 1000,
  );
  if (!limit.allowed) {
    return NextResponse.json({ error: "demo_limit" }, { status: 429 });
  }

  try {
    const { text } = await generateResponse({
      task: "chat-simple",
      system: DEMO_SYSTEM,
      messages: [{ role: "user", content: parsed.message }],
      temperature: 0.3,
      maxTokens: 200,
    });
    return NextResponse.json({ reply: text });
  } catch (err) {
    console.error("[demo-chat] failed:", err);
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }
}
