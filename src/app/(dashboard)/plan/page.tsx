import { TermColumn } from "@/components/planner/term-column";
import { getUserPlanSnapshot, termRange } from "@/lib/db/queries/plan";
import { getSession } from "@/lib/get-session";
import { buildPlan, groupByTerm, validatePlan } from "@/lib/validation/plan";
import { redirect } from "next/navigation";

export const metadata = {
  title: "My Plan",
};

/**
 * Default term range — covers a typical 4-year SOEN program with summers.
 * Will become configurable from settings in a later phase.
 */
const DEFAULT_START = "Fall 2026";
const DEFAULT_END = "Winter 2030";

export default async function PlanPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { userPlan, catalog } = await getUserPlanSnapshot(session.user.id);
  const plan = buildPlan(userPlan, [...catalog.values()]);
  const issues = validatePlan(plan);

  // Collect course codes that have at least one error issue → red badge.
  const violationCodes = new Set<string>();
  for (const i of issues) {
    if (i.severity === "error" && i.courseCode) violationCodes.add(i.courseCode);
  }

  const termsByLabel = groupByTerm(userPlan);
  const allTerms = termRange(DEFAULT_START, DEFAULT_END);

  // Skip purely-empty Summer terms in the rendered grid to keep things scannable.
  const visibleTerms = allTerms.filter((term) => {
    if (term.startsWith("Summer")) {
      return (termsByLabel.get(term)?.length ?? 0) > 0;
    }
    return true;
  });

  const userCount = userPlan.length;

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">My Plan</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {userCount === 0
              ? "Your plan is empty. Phase 2.10 will add an onboarding wizard so you can import or build one."
              : `${userCount} courses planned across ${termsByLabel.size} terms.`}
          </p>
        </div>
        {issues.length > 0 && (
          <div
            className="rounded-md border px-3 py-2 text-xs"
            style={{
              background: "var(--color-danger-soft)",
              borderColor: "color-mix(in oklch, var(--color-danger) 30%, var(--color-border))",
              color: "var(--color-danger)",
            }}
          >
            <strong>{issues.length}</strong> validation issue
            {issues.length === 1 ? "" : "s"} detected
          </div>
        )}
      </header>

      {/* Horizontal scroll of term columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-8 md:px-8">
        {visibleTerms.map((term) => (
          <TermColumn
            key={term}
            term={term}
            courses={termsByLabel.get(term) ?? []}
            catalog={catalog}
            violationsByCourse={violationCodes}
          />
        ))}
      </div>

      {/* Issue list (compact) */}
      {issues.length > 0 && (
        <section className="space-y-2">
          <h2
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Issues
          </h2>
          <ul className="space-y-1.5">
            {issues.slice(0, 20).map((i, idx) => (
              <li
                key={`${i.rule}-${i.courseCode}-${i.term}-${idx}`}
                className="text-sm flex items-start gap-2 rounded-md border px-3 py-2"
                style={{
                  background: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mt-1.5"
                  style={{
                    background:
                      i.severity === "error"
                        ? "var(--color-danger)"
                        : i.severity === "warning"
                          ? "var(--color-warning)"
                          : "var(--color-text-muted)",
                  }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {i.courseCode && (
                      <span className="mono tnum text-xs font-semibold">{i.courseCode}</span>
                    )}
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {i.term}
                    </span>
                  </div>
                  <p>{i.message}</p>
                  {i.suggestion && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      Suggestion: {i.suggestion}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {issues.length > 20 && (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              + {issues.length - 20} more issues
            </p>
          )}
        </section>
      )}
    </div>
  );
}
