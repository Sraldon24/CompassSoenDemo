import { AIInsightWidget } from "@/components/dashboard/ai-insight";
import { RecommendationsWidget } from "@/components/dashboard/recommendations";
import { type StatTile, StatTiles } from "@/components/dashboard/stat-tiles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/get-session";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { computeCategoryProgress, totalDegreeProgress } from "@/lib/domain/requirements";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CircleDot,
  Clock,
  GraduationCap,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

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

  const stats: StatTile[] = [
    {
      label: "Completed",
      value: counts.completed,
      icon: GraduationCap,
      color: "var(--color-success)",
    },
    { label: "In Progress", value: counts.enrolled, icon: CircleDot, color: "var(--color-accent)" },
    { label: "Planned", value: counts.planned, icon: Layers, color: "var(--color-text-muted)" },
    {
      label: "Remaining",
      value: remainingCredits,
      icon: TrendingUp,
      color: "var(--color-text-muted)",
      suffix: "cr",
    },
    {
      label: "Deficiencies",
      value: counts.deficiencies,
      icon: AlertTriangle,
      color: "var(--color-warning)",
    },
  ];

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-8">
      {/* Welcome + progress — glowing hero panel */}
      <section
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-8 animate-rise"
        style={{
          background: "var(--gradient-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="glow-accent absolute inset-0" aria-hidden />
        <div className="relative space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome back, <span className="text-gradient">{name}</span> <span aria-hidden>👋</span>
          </h1>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {userPlan.length === 0
                ? "Your plan is empty. Head to My Plan to start adding courses, or import from Excel."
                : `Tracking ${userPlan.length} courses across your plan.`}
            </p>
            <p className="text-sm mono tnum" style={{ color: "var(--color-text-muted)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {degree.done + degree.inProgress}
              </span>{" "}
              / {degree.total} credits
              <span className="ml-1" style={{ color: "var(--color-accent)" }}>
                ({pct}%)
              </span>
            </p>
          </div>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden"
            style={{ background: "var(--color-surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-out-soft)]"
              style={{ background: "var(--gradient-accent)", width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Stats grid — animated count-up tiles */}
      <section>
        <StatTiles tiles={stats} />
      </section>

      {/* AI insight widget — streams in via Suspense */}
      <section>
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
                  AI Insight of the Day
                </CardTitle>
                <CardDescription>Generating today&apos;s insight…</CardDescription>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          }
        >
          <AIInsightWidget userId={session.user.id} />
        </Suspense>
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

      {/* Recommended next courses — client-side fetch with refresh button */}
      <section>
        <RecommendationsWidget />
      </section>

      {/* Quick link to planner — featured CTA banner */}
      <section
        className="lift group relative overflow-hidden rounded-xl border p-6"
        style={{ background: "var(--gradient-accent-soft)", borderColor: "var(--color-border)" }}
      >
        <div className="relative flex items-start gap-4">
          <div
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ backgroundImage: "var(--gradient-accent)" }}
          >
            <Calendar className="h-5 w-5" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-base font-semibold tracking-tight">Open your planner</h3>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Drag courses between terms, watch prereq violations light up, and check workload
              before registration.
            </p>
          </div>
          <Link
            href="/plan"
            className="inline-flex items-center gap-1.5 self-center rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm transition-transform group-hover:translate-x-0.5"
            style={{ backgroundImage: "var(--gradient-accent)" }}
          >
            My Plan
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
