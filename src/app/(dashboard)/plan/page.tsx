import { PlannerBoard } from "@/components/planner/planner-board";
import { getUserPlanSnapshot, termRange } from "@/lib/db/queries/plan";
import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";

export const metadata = {
  title: "My Plan",
};

const DEFAULT_START = "Fall 2026";
const DEFAULT_END = "Winter 2030";

export default async function PlanPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { userPlan, catalog } = await getUserPlanSnapshot(session.user.id);
  const allTerms = termRange(DEFAULT_START, DEFAULT_END);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">My Plan</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {userPlan.length === 0
              ? "Your plan is empty. Phase 2.10 will add an onboarding wizard so you can import or build one."
              : `${userPlan.length} courses planned. Drag a card to a different term to reschedule.`}
          </p>
        </div>
      </header>

      <PlannerBoard
        initialCourses={userPlan}
        catalogList={[...catalog.values()]}
        visibleTerms={allTerms}
      />
    </div>
  );
}
