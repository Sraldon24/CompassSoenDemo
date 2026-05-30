/**
 * GET  /api/courses/[code]/reviews — public list (filtered to active moderation)
 * POST /api/courses/[code]/reviews — submit a review (auth required)
 *
 * The body schema mirrors the schema fields with light client-friendly
 * validation. Comments < 30 chars are rejected so people don't leave a "k"
 * as a "review."
 */

import { courseGuard, courseThenLimitGuard } from "@/lib/api/route-guard";
import { getCourseReviews, submitReview } from "@/lib/community/reviews";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ code: string }>;
}

const submitSchema = z.object({
  professorName: z.string().min(2).max(120),
  rating: z.number().int().min(1).max(5),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  term: z.string().min(2).max(40).nullable().optional(),
  wouldTakeAgain: z.boolean().nullable().optional(),
  comment: z.string().min(30).max(4000).nullable().optional(),
  isAnonymous: z.boolean().optional(),
});

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { code: raw } = await context.params;
  const guard = await courseGuard(raw);
  if (!guard.ok) return guard.response;

  const summary = await getCourseReviews(guard.code);
  return NextResponse.json({ courseCode: guard.code, ...summary });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { code: raw } = await context.params;
  const guard = await courseThenLimitGuard(raw, "courseCommunity");
  if (!guard.ok) return guard.response;
  const { session, code } = guard;

  let parsed: z.infer<typeof submitSchema>;
  try {
    parsed = submitSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "unknown" },
      { status: 400 },
    );
  }

  try {
    const { id } = await submitReview({
      userId: session.user.id,
      courseCode: code,
      professorName: parsed.professorName,
      rating: parsed.rating,
      difficulty: parsed.difficulty ?? null,
      term: parsed.term ?? null,
      wouldTakeAgain: parsed.wouldTakeAgain ?? null,
      comment: parsed.comment ?? null,
      isAnonymous: parsed.isAnonymous ?? true,
    });
    return NextResponse.json({ ok: true, reviewId: id });
  } catch (err) {
    console.error(`[reviews] submit failed for ${code}:`, err);
    return NextResponse.json(
      { error: "submit_failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
