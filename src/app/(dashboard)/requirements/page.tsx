import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CourseCode } from "@/components/ui/course-code";
import { getSession } from "@/lib/auth/get-session";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { computeCategoryProgress, totalDegreeProgress } from "@/lib/domain/requirements";
import { BookOpen, Calendar, Check, Clock, Plus } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Requirements",
};

/** Per-category accent hue (Meridian print palette). */
const CATEGORY_HUE: Record<string, string> = {
  se_core: "var(--accent)",
  eng_core: "var(--info)",
  soen_elective: "oklch(0.6 0.15 330)",
  nat_sci_elective: "var(--ok)",
  eng_nsci_group: "var(--warn)",
  gen_ed_humanities: "oklch(0.6 0.15 330)",
  deficiency: "var(--bad)",
};

/** Donut ring (ported from Meridian Ring primitive). */
function Ring({
  value,
  max,
  size = 132,
  stroke = 12,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  children: React.ReactNode;
}): React.ReactElement {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 1s var(--ease)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Layered progress bar: solid = done, ghost = planned (ported from Meridian Bar). */
function Bar({
  value,
  max,
  planned,
  color,
}: {
  value: number;
  max: number;
  planned: number;
  color: string;
}): React.ReactElement {
  const pct = Math.min(100, (value / max) * 100);
  const ppct = Math.min(100, (planned / max) * 100);
  return (
    <div
      className="relative h-2 overflow-hidden rounded-full border border-[var(--line)]"
      style={{ background: "var(--surface-2)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          width: `${ppct}%`,
          background: `color-mix(in oklch, ${color} 22%, transparent)`,
        }}
      />
      <div
        className="absolute inset-0 rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-out-soft)]"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export default async function RequirementsPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { userPlan, catalog } = await getUserPlanSnapshot(session.user.id);
  const progress = computeCategoryProgress(userPlan, catalog);
  const overall = totalDegreeProgress(progress);
  const earned = overall.done;
  const remainingToMap = Math.max(
    0,
    overall.total - overall.done - overall.inProgress - overall.planned,
  );

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 md:px-7 md:py-7 stagger">
      {/* Page header */}
      <header className="mb-6 animate-rise">
        <p className="eyebrow mb-1.5">Degree audit · §71.70.9</p>
        <h1 className="font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          Requirements
        </h1>
      </header>

      {/* Overview */}
      <div
        className="card card-hard mb-6 flex flex-col items-center gap-6 p-6 sm:flex-row sm:gap-7"
        style={{ ["--i" as string]: 0 }}
      >
        <Ring value={earned + overall.inProgress} max={overall.total}>
          <div>
            <div className="mono text-[26px] font-bold leading-none">
              {earned + overall.inProgress}
            </div>
            <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              of {overall.total} cr
            </div>
          </div>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1.5">Concordia BEng Software Engineering · §71.70.9</p>
          <h2 className="mb-2.5 font-heading text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
            You&apos;re on a complete, valid path to graduation
          </h2>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="mono text-2xl font-bold" style={{ color: "var(--ok)" }}>
                {earned}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-3)" }}>
                Earned
              </div>
            </div>
            <div>
              <div className="mono text-2xl font-bold" style={{ color: "var(--accent)" }}>
                {overall.inProgress + overall.planned}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-3)" }}>
                Planned
              </div>
            </div>
            <div>
              <div className="mono text-2xl font-bold" style={{ color: "var(--ink-3)" }}>
                {remainingToMap}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-3)" }}>
                Remaining to map
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
        {progress.map((cp, ci) => {
          const totalCreditsInCategory = cp.doneCredits + cp.inProgressCredits + cp.plannedCredits;
          const planned = Math.round(totalCreditsInCategory * 10) / 10;
          const pct = Math.min(
            100,
            Math.round(((cp.doneCredits + cp.inProgressCredits) / cp.spec.requiredCredits) * 100),
          );
          const complete = totalCreditsInCategory >= cp.spec.requiredCredits;
          const color = CATEGORY_HUE[cp.spec.key] ?? "var(--accent)";

          return (
            <Card key={cp.spec.key} interactive style={{ ["--i" as string]: ci + 1 }}>
              <CardHeader className="gap-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="size-3 shrink-0 rounded-[4px]"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <h3 className="truncate font-heading text-[16.5px] font-semibold leading-tight tracking-[-0.01em]">
                        {cp.spec.label}
                      </h3>
                    </div>
                    <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      {cp.courses.length} courses listed
                    </div>
                  </div>
                  {complete ? (
                    <Badge variant="success" className="shrink-0">
                      <Check className="size-3" aria-hidden="true" /> Met
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      {pct}%
                    </Badge>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span style={{ color: "var(--ink-2)" }}>Credits</span>
                    <span className="mono tnum font-bold">
                      {planned}
                      <span style={{ color: "var(--ink-3)" }}> / {cp.spec.requiredCredits}</span>
                    </span>
                  </div>
                  <Bar
                    value={cp.doneCredits + cp.inProgressCredits}
                    max={cp.spec.requiredCredits}
                    planned={totalCreditsInCategory}
                    color={color}
                  />
                </div>
              </CardHeader>

              <CardContent>
                {cp.courses.length === 0 ? (
                  <div
                    className="flex flex-col items-center gap-2 rounded-[var(--r-md)] border border-dashed py-6 text-center"
                    style={{ borderColor: "var(--line-strong)" }}
                  >
                    <span
                      className="inline-flex size-9 items-center justify-center rounded-[var(--r-md)]"
                      style={{ background: "var(--accent-soft)" }}
                    >
                      <BookOpen
                        className="size-4"
                        style={{ color: "var(--accent)" }}
                        aria-hidden="true"
                      />
                    </span>
                    <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                      No courses planned in this category yet.
                    </p>
                  </div>
                ) : (
                  <div className="scroll flex max-h-[208px] flex-col gap-1.5 overflow-y-auto">
                    {cp.courses.map(({ course, catalog: entry }) => {
                      const isDone =
                        course.status === "transferred" || course.status === "completed";
                      const isEnrolled = course.status === "enrolled";
                      const isPlanned = course.status === "planned";
                      const statusColor = isDone
                        ? "var(--ok)"
                        : isEnrolled
                          ? "var(--accent-deep)"
                          : "var(--ink-3)";
                      const statusBg = isDone
                        ? "var(--ok-soft)"
                        : isEnrolled
                          ? "var(--accent-soft)"
                          : isPlanned
                            ? "var(--surface-2)"
                            : "transparent";
                      const StatusIcon = isDone
                        ? Check
                        : isEnrolled
                          ? Clock
                          : isPlanned
                            ? Calendar
                            : Plus;
                      const statusLabel = isDone
                        ? course.status === "transferred"
                          ? "Transferred"
                          : "Done"
                        : isEnrolled
                          ? "In progress"
                          : "Planned";
                      return (
                        <div
                          key={`${course.courseCode}-${course.term}`}
                          className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] border-[1.5px] px-2.5 py-2 transition-colors hover:border-[var(--line-strong)]"
                          style={{
                            borderColor: "var(--line)",
                            background:
                              course.status === "planned" || isDone || isEnrolled
                                ? "var(--surface)"
                                : "transparent",
                          }}
                        >
                          <span
                            className="grid size-[22px] shrink-0 place-items-center rounded-[6px]"
                            style={{ background: statusBg, color: statusColor }}
                            aria-hidden="true"
                          >
                            <StatusIcon className="size-[13px]" />
                          </span>
                          <CourseCode code={course.courseCode} />
                          <span
                            className="min-w-0 flex-1 truncate text-[12.5px]"
                            style={{ color: "var(--ink-2)" }}
                          >
                            {entry?.title ?? "Unknown course"}
                          </span>
                          <span
                            className="mono tnum shrink-0 text-[11px]"
                            style={{ color: "var(--ink-3)" }}
                          >
                            {entry?.credits ?? "?"}
                          </span>
                          <span className="shrink-0 text-[10px]" style={{ color: "var(--ink-3)" }}>
                            {course.term} · {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
