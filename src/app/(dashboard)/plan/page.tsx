import { AIReview } from "@/components/planner/ai-review";
import { PlannerBoard } from "@/components/planner/planner-board";
import { getSession } from "@/lib/auth/get-session";
import { getAllCourses, getUserPlanSnapshot, termRange } from "@/lib/data/queries/plan";
import { redirect } from "next/navigation";

export const metadata = {
  title: "My Plan",
};

const DEFAULT_START = "Fall 2026";
const DEFAULT_END = "Winter 2030";

export default async function PlanPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  // The snapshot's `catalog` only covers courses the user already references, so
  // the "+ Add course" picker needs the FULL catalog instead — otherwise it
  // shows "No matching courses" for an empty plan.
  const [{ userPlan }, fullCatalog] = await Promise.all([
    getUserPlanSnapshot(session.user.id),
    getAllCourses(),
  ]);
  const allTerms = termRange(DEFAULT_START, DEFAULT_END);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">My Plan</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {userPlan.length === 0
              ? "Your plan is empty. Use the Add course buttons below or import your existing plan."
              : `${userPlan.length} courses planned. Drag a card to a different term to reschedule.`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/export/pdf"
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/10"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            Download PDF
          </a>
          <a
            href="/api/export/ics"
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/10"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            Calendar (.ics)
          </a>
          <a
            href="/settings/import"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/10"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            Import Excel
          </a>
        </div>
      </header>

      <AIReview />

      <PlannerBoard initialCourses={userPlan} catalogList={fullCatalog} visibleTerms={allTerms} />
    </div>
  );
}
