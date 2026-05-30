/**
 * GET /api/courses/[code]/community
 *
 * Returns the cached Reddit summary for a course. Hits the read-or-regenerate
 * cache layer — fresh cache returns instantly with no Groq calls, stale cache
 * returns the old value and kicks off a background refresh, cold cache
 * generates synchronously (~5-8 seconds).
 *
 * Auth: requires a logged-in session (consistent with the rest of the app —
 * unauthenticated traffic uses /demo). Session + rate-limit + course-code
 * validation are handled by courseLimitGuard (limit checked before code, the
 * historical order for this route).
 */

import { courseLimitGuard } from "@/lib/api/route-guard";
import { getCourseSummary } from "@/lib/community/summaries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { code: raw } = await context.params;
  const guard = await courseLimitGuard(raw, "courseCommunity");
  if (!guard.ok) return guard.response;
  const code = guard.code;

  try {
    const row = await getCourseSummary(code);
    if (!row) {
      return NextResponse.json({
        courseCode: code,
        hasData: false,
        message: "No community discussion found yet for this course.",
      });
    }
    return NextResponse.json({
      courseCode: code,
      hasData: true,
      generatedAt: row.generatedAt.toISOString(),
      isStale: row.isStale,
      summary: row.summary,
    });
  } catch (err) {
    console.error(`[community] failed for ${code}:`, err);
    return NextResponse.json(
      {
        error: "summary_generation_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
