/**
 * POST /api/courses/[code]/difficulty
 * GET  /api/courses/[code]/difficulty
 *
 * Lets a logged-in student record how hard they found a course. The vote
 * itself goes into `difficulty_votes`; the aggregate is denormalized onto
 * `courses.difficultyAvg` so reads stay fast.
 *
 * GET returns the current aggregate + the caller's own vote (so the UI can
 * pre-select their previous answer).
 */

import { apiError, apiOk } from "@/lib/api/response";
import { courseGuard, courseThenLimitGuard } from "@/lib/api/route-guard";
import { castDifficultyVote, getDifficultySummary, getUserVote } from "@/lib/community/difficulty";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ code: string }>;
}

const bodySchema = z.object({
  vote: z.enum(["easy", "medium", "hard"]),
  term: z.string().min(1).max(40).optional(),
  instructor: z.string().min(1).max(120).optional(),
});

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { code: raw } = await context.params;
  const guard = await courseGuard(raw);
  if (!guard.ok) return guard.response;
  const { session, code } = guard;

  const [summary, mine] = await Promise.all([
    getDifficultySummary(code),
    getUserVote(session.user.id, code),
  ]);

  return apiOk({ courseCode: code, summary, yourVote: mine });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { code: raw } = await context.params;
  const guard = await courseThenLimitGuard(raw, "courseCommunity");
  if (!guard.ok) return guard.response;
  const { session, code } = guard;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return apiError("invalid_body", 400);
  }

  try {
    const summary = await castDifficultyVote({
      userId: session.user.id,
      courseCode: code,
      vote: parsed.vote,
      term: parsed.term,
      instructor: parsed.instructor,
    });
    return apiOk({ courseCode: code, summary, yourVote: parsed.vote });
  } catch (err) {
    console.error(`[difficulty] vote failed for ${code}:`, err);
    return apiError("vote_failed", 500);
  }
}
