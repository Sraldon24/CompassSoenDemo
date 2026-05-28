import { getUserPlanSnapshot } from "@/lib/db/queries/plan";
import { generatePlanPDF } from "@/lib/exports/pdf";
import { getSession } from "@/lib/get-session";
import { computeCategoryProgress, totalDegreeProgress } from "@/lib/requirements";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="soen-compass-plan.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
