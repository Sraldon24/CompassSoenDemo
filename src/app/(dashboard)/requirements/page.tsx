import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/get-session";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import {
  TOTAL_DEGREE_CREDITS,
  computeCategoryProgress,
  totalDegreeProgress,
} from "@/lib/domain/requirements";
import { BookOpen } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Requirements",
};

export default async function RequirementsPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { userPlan, catalog } = await getUserPlanSnapshot(session.user.id);
  const progress = computeCategoryProgress(userPlan, catalog);
  const overall = totalDegreeProgress(progress);
  const overallPct = Math.min(
    100,
    Math.round(((overall.done + overall.inProgress) / overall.total) * 100),
  );

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-8">
      <header
        className="relative overflow-hidden rounded-2xl ring-hairline shadow-[var(--shadow-md)] p-6 sm:p-8 space-y-3 animate-rise"
        style={{ background: "var(--gradient-surface)" }}
      >
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div className="relative space-y-3">
          <p className="eyebrow">Degree audit</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Requirements</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            BEng Software Engineering — {TOTAL_DEGREE_CREDITS} credits required. Track your progress
            per category.
          </p>

          <div className="space-y-2 pt-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--color-text-muted)" }}
              >
                Overall degree progress
              </span>
              <span className="mono tnum text-sm">
                {overall.done + overall.inProgress} / {overall.total} credits{" "}
                <span style={{ color: "var(--color-accent)" }}>({overallPct}%)</span>
              </span>
            </div>
            <div
              className="h-2.5 w-full rounded-full overflow-hidden ring-hairline"
              style={{ background: "var(--color-surface-3)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-out-soft)] shadow-[0_0_14px_var(--color-accent-ring)]"
                style={{
                  background: "var(--gradient-accent)",
                  width: `${overallPct}%`,
                }}
              />
            </div>
            <div
              className="flex flex-wrap gap-4 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span>
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={{ background: "var(--color-success)" }}
                />
                Done: <span className="mono tnum">{overall.done}</span>
              </span>
              <span>
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={{ background: "var(--color-accent)" }}
                />
                In progress: <span className="mono tnum">{overall.inProgress}</span>
              </span>
              <span>
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={{ background: "var(--color-text-subtle)" }}
                />
                Planned: <span className="mono tnum">{overall.planned}</span>
              </span>
              <span>
                Remaining:{" "}
                <span className="mono tnum">
                  {Math.max(0, overall.total - overall.done - overall.inProgress - overall.planned)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-8 stagger">
        {progress.map((cp, ci) => {
          const totalCreditsInCategory = cp.doneCredits + cp.inProgressCredits + cp.plannedCredits;
          const pct = Math.min(
            100,
            Math.round(((cp.doneCredits + cp.inProgressCredits) / cp.spec.requiredCredits) * 100),
          );

          return (
            <Card key={cp.spec.key} interactive style={{ ["--i" as string]: ci }}>
              <CardHeader className="space-y-1">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">{cp.spec.label}</CardTitle>
                  <span className="mono tnum text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {totalCreditsInCategory} / {cp.spec.requiredCredits} cr
                    <span className="ml-1.5">({pct}%)</span>
                  </span>
                </div>
                {cp.spec.description && (
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {cp.spec.description}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  className="h-2 w-full rounded-full overflow-hidden ring-hairline"
                  style={{ background: "var(--color-surface-3)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-out-soft)]"
                    style={{
                      background:
                        cp.spec.key === "deficiency"
                          ? "var(--color-warning)"
                          : "var(--gradient-accent)",
                      boxShadow:
                        cp.spec.key === "deficiency"
                          ? "0 0 14px var(--color-warning-soft)"
                          : "0 0 14px var(--color-accent-ring)",
                      width: `${pct}%`,
                    }}
                  />
                </div>

                {cp.courses.length === 0 ? (
                  <div
                    className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-6 text-center"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl ring-hairline"
                      style={{ background: "var(--gradient-accent-soft)" }}
                    >
                      <BookOpen
                        className="h-4 w-4"
                        style={{ color: "var(--color-accent)" }}
                        aria-hidden="true"
                      />
                    </span>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No courses planned in this category yet.
                    </p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {cp.courses.map(({ course, catalog: entry }) => {
                      const statusColor =
                        course.status === "transferred" || course.status === "completed"
                          ? "var(--color-success)"
                          : course.status === "enrolled"
                            ? "var(--color-accent)"
                            : "var(--color-text-subtle)";
                      const statusLabel =
                        course.status === "transferred"
                          ? "Transferred"
                          : course.status === "completed"
                            ? "Done"
                            : course.status === "enrolled"
                              ? "In progress"
                              : "Planned";
                      return (
                        <li
                          key={`${course.courseCode}-${course.term}`}
                          className="flex items-center gap-2 rounded-lg ring-hairline px-3 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                          style={{ background: "var(--color-surface)" }}
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: statusColor }}
                            aria-hidden
                          />
                          <span className="mono tnum text-xs font-semibold">
                            {course.courseCode}
                          </span>
                          <span
                            className="flex-1 min-w-0 truncate text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {entry?.title ?? "Unknown course"}
                          </span>
                          <span
                            className="mono tnum text-[10px] shrink-0"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {entry?.credits ?? "?"}cr
                          </span>
                          <span
                            className="text-[10px] shrink-0"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {course.term} · {statusLabel}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
