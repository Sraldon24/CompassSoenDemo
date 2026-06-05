import { AIInsightWidget } from "@/components/dashboard/ai-insight";
import { RecommendationsWidget } from "@/components/dashboard/recommendations";
import { type StatTile, StatTiles } from "@/components/dashboard/stat-tiles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/get-session";
import { getUserPlanSnapshot } from "@/lib/data/queries/plan";
import {
  type CategoryProgress,
  computeCategoryProgress,
  totalDegreeProgress,
} from "@/lib/domain/requirements";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

// Accent colors per requirement category (Meridian hues).
const CATEGORY_HUE: Record<string, string> = {
  se_core: "var(--accent)",
  eng_core: "var(--info)",
  soen_elective: "oklch(0.6 0.15 330)",
  nat_sci_elective: "var(--ok)",
  eng_nsci_group: "var(--ok)",
  gen_ed_humanities: "var(--warn)",
  deficiency: "var(--bad)",
};

/** Donut ring — ported from the Meridian Ring primitive. */
function Ring({
  value,
  max,
  size = 128,
  stroke = 11,
  color = "var(--accent)",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, max > 0 ? value / max : 0);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Progress ring">
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
          stroke={color}
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

/** Per-category progress bar — done fill + lighter planned underlay. */
function CategoryBar({
  done,
  planned,
  max,
  color,
}: {
  done: number;
  planned: number;
  max: number;
  color: string;
}): React.ReactElement {
  const pct = Math.min(100, max > 0 ? (done / max) * 100 : 0);
  const ppct = Math.min(100, max > 0 ? (planned / max) * 100 : 0);
  return (
    <div
      className="relative h-[7px] overflow-hidden rounded-full"
      style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          width: `${ppct}%`,
          background: `color-mix(in oklch, ${color} 22%, transparent)`,
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{ width: `${pct}%`, background: color, transition: "width .6s var(--ease)" }}
      />
    </div>
  );
}

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
      icon: "graduation",
      color: "var(--color-success)",
    },
    {
      label: "In Progress",
      value: counts.enrolled,
      icon: "inProgress",
      color: "var(--color-accent)",
    },
    { label: "Planned", value: counts.planned, icon: "planned", color: "var(--color-text-muted)" },
    {
      label: "Remaining",
      value: remainingCredits,
      icon: "remaining",
      color: "var(--color-text-muted)",
      suffix: "cr",
    },
    {
      label: "Deficiencies",
      value: counts.deficiencies,
      icon: "deficiency",
      color: "var(--color-warning)",
    },
  ];

  // Degree-counted categories for the requirements snapshot (deficiencies excluded).
  const snapshotCategories: CategoryProgress[] = progress.filter(
    (c) => c.spec.key !== "deficiency",
  );

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1180px] mx-auto space-y-5 stagger">
      {/* Welcome + progress — Meridian ink-bordered hero */}
      <section
        className="card card-hard relative overflow-hidden p-6 sm:p-7 animate-rise"
        style={{ ["--i" as string]: 0 }}
      >
        <div className="relative space-y-4">
          <p className="eyebrow" style={{ color: "var(--accent-deep)" }}>
            Dashboard
          </p>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
            Welcome back, <span style={{ color: "var(--accent-deep)" }}>{name}</span>{" "}
            <span aria-hidden>👋</span>
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
            className="h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-out-soft)]"
              style={{ background: "var(--accent)", width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      {/* AI insight widget — the headline InsightCard, streams in via Suspense */}
      <section style={{ ["--i" as string]: 1 }}>
        <Suspense
          fallback={
            <div
              className="card card-hard relative overflow-hidden px-[26px] py-6"
              style={{
                background: "linear-gradient(120deg, var(--accent-soft), transparent 70%)",
                borderColor: "color-mix(in oklch, var(--accent) 34%, transparent)",
              }}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className="inline-grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg"
                  style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                >
                  <Sparkles className="h-[17px] w-[17px]" aria-hidden />
                </span>
                <span className="eyebrow" style={{ color: "var(--accent-deep)" }}>
                  Insight of the day
                </span>
              </div>
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          }
        >
          <AIInsightWidget userId={session.user.id} />
        </Suspense>
      </section>

      {/* Stats grid — animated count-up tiles */}
      <section style={{ ["--i" as string]: 2 }}>
        <StatTiles tiles={stats} />
      </section>

      {/* Requirements snapshot + Up next deadlines */}
      <section
        className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5"
        style={{ ["--i" as string]: 3 }}
      >
        {/* Requirements snapshot — donut Ring + per-category bars */}
        <div className="card p-[22px]">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow mb-1.5">Concordia §71.70.9</div>
              <h2 className="font-heading text-[21px] font-semibold tracking-[-0.02em]">
                Requirements snapshot
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/requirements" />}
              data-icon="inline-end"
            >
              Details
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-6">
            <Ring value={degree.done + degree.inProgress} max={degree.total} size={128}>
              <div>
                <div className="mono tnum text-[26px] font-bold leading-none">{pct}%</div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                  complete
                </div>
              </div>
            </Ring>
            <div className="flex w-full flex-1 flex-col gap-[13px]">
              {snapshotCategories.map((cp) => {
                const planned = cp.doneCredits + cp.inProgressCredits + cp.plannedCredits;
                const color = CATEGORY_HUE[cp.spec.key] ?? "var(--accent)";
                return (
                  <div key={cp.spec.key}>
                    <div className="mb-1.5 flex items-center justify-between gap-2.5 text-[12.5px]">
                      <span className="truncate font-semibold">{cp.spec.label}</span>
                      <span
                        className="mono tnum shrink-0 whitespace-nowrap"
                        style={{ color: "var(--color-text-subtle)" }}
                      >
                        {Math.round(planned)}/{cp.spec.requiredCredits}
                      </span>
                    </div>
                    <CategoryBar
                      done={cp.doneCredits}
                      planned={planned}
                      max={cp.spec.requiredCredits}
                      color={color}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Up next — Concordia deadlines as date tiles */}
        <div className="card p-[22px]">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow mb-1.5">Don&apos;t miss</div>
              <h2 className="font-heading text-[21px] font-semibold tracking-[-0.02em]">Up next</h2>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/deadlines" />}>
              All dates
            </Button>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-[var(--r-md)]" />
            <Skeleton className="h-14 w-full rounded-[var(--r-md)]" />
            <Skeleton className="h-14 w-full rounded-[var(--r-md)]" />
          </div>
        </div>
      </section>

      {/* Recommended next courses — client-side fetch with refresh button */}
      <section style={{ ["--i" as string]: 4 }}>
        <RecommendationsWidget />
      </section>

      {/* Quick link to planner — Meridian accent CTA banner */}
      <section
        className="lift card card-hard relative overflow-hidden p-6"
        style={{
          ["--i" as string]: 5,
          background: "linear-gradient(120deg, var(--accent-soft), transparent 70%)",
          borderColor: "color-mix(in oklch, var(--accent) 34%, transparent)",
        }}
      >
        <div className="relative flex items-start gap-4">
          <div
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ring-hairline"
            style={{ background: "var(--accent)" }}
          >
            <Calendar className="h-5 w-5" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="font-heading text-base font-semibold tracking-tight">
              Open your planner
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Drag courses between terms, watch prereq violations light up, and check workload
              before registration.
            </p>
          </div>
          <Button
            variant="accent"
            size="sm"
            render={<Link href="/plan" />}
            className="self-center"
            data-icon="inline-end"
          >
            My Plan
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
