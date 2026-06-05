import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { apiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/get-session";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { computeCategoryProgress, totalDegreeProgress } from "@/lib/domain/requirements";
import { generatePlanPDF } from "@/lib/exports/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return apiError("unauthorized", 401);

  const { userPlan, catalog } = await getUserPlanSnapshot(session.user.id);
  const progress = computeCategoryProgress(userPlan, catalog);
  const totals = totalDegreeProgress(progress);

  const buffer = await generatePlanPDF({
    studentName: session.user.name ?? "Student",
    generatedAt: new Date().toLocaleDateString("en-CA"),
    userPlan,
    catalog,
    progress,
    totals,
  });

  void trackServer(session.user.id, ANALYTICS_EVENTS.export_pdf);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="soen-compass-plan.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
