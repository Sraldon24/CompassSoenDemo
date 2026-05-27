import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserPlanSnapshot } from "@/lib/db/queries/plan";
import { getSession } from "@/lib/get-session";
import { computeCategoryProgress, totalDegreeProgress } from "@/lib/requirements";
import { Calendar, Clock, GraduationCap, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");
  const name = session.user.name?.split(/\s+/)[0] ?? "there";

  const { userPlan, catalog } = await getUserPlanSnapshot(session.user.id);
  const progress = computeCategoryProgress(userPlan, catalog);
  const degree = totalDegreeProgress(progress);
  const pct = Math.min(100, Math.round(((degree.done + degree.inProgress) / degree.total) * 100));

  // Tally stat-grid counts from the real plan (course counts, not credits).
  const counts = {
    completed: 0,
    enrolled: 0,
    planned: 0,
    deficiencies: 0,
  };
  for (const p of userPlan) {
    if (p.status === "transferred" || p.status === "completed") counts.completed += 1;
    else if (p.status === "enrolled") counts.enrolled += 1;
    else if (p.status === "planned") counts.planned += 1;
  }
  const defProgress = progress.find((c) => c.spec.key === "deficiency");
  counts.deficiencies = defProgress?.courses.length ?? 0;

  const remainingCredits = Math.max(
    0,
    degree.total - degree.done - degree.inProgress - degree.planned,
  );

  const stats = [
    { label: "Completed", value: counts.completed, color: "var(--color-success)" },
    { label: "In Progress", value: counts.enrolled, color: "var(--color-accent)" },
    { label: "Planned", value: counts.planned, color: "var(--color-text-muted)" },
    { label: "Remaining (cr)", value: remainingCredits, color: "var(--color-text-muted)" },
    { label: "Deficiencies", value: counts.deficiencies, color: "var(--color-warning)" },
  ];

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-8">
      {/* Welcome + progress */}
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back, {name} <span aria-hidden>👋</span>
        </h1>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {userPlan.length === 0
              ? "Your plan is empty. Head to My Plan to start adding courses, or import from Excel (coming soon)."
              : `Tracking ${userPlan.length} courses across your plan.`}
          </p>
          <p className="text-sm mono tnum" style={{ color: "var(--color-text-muted)" }}>
            {degree.done + degree.inProgress} / {degree.total} credits ({pct}%)
          </p>
        </div>
        <div
          className="h-2 w-full rounded-full overflow-hidden"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ background: "var(--color-accent)", width: `${pct}%` }}
          />
        </div>
      </section>

      {/* Stats grid */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="mt-2 text-2xl font-semibold mono tnum">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* AI insight widget — skeleton */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              AI Insight of the Day
            </CardTitle>
            <CardDescription>
              Compass will analyze your plan and surface a suggestion here once your courses are
              seeded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </section>

      {/* Deadlines + Action items */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" style={{ color: "var(--color-warning)" }} />
              Upcoming Deadlines
            </CardTitle>
            <CardDescription>Important Concordia dates in the next 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              Action Items
            </CardTitle>
            <CardDescription>Things to do before the next term starts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </section>

      {/* Recommended next courses */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              Recommended Next Courses
            </CardTitle>
            <CardDescription>
              Based on your interests and current plan. Powered by AI in Phase 3.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-md border p-3 space-y-2"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Quick link to planner */}
      <section
        className="rounded-lg border p-5"
        style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
      >
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
          <div className="space-y-2 flex-1">
            <h3 className="text-sm font-semibold">Open your planner</h3>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Drag courses between terms, watch prereq violations light up, and check workload
              before registration.
            </p>
            <Link
              href="/plan"
              className="inline-flex items-center text-sm font-medium underline-offset-4 hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              Go to My Plan →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
