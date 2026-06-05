/**
 * /courses/[code] — course detail page.
 *
 * Shared canvas for Phase 4 community features:
 *   - #83 Reddit summary block ("What students are saying")
 *   - #86 Difficulty vote widget (this page first shipped with #86)
 *   - #87 Professor reviews (added below in same page)
 *   - #88 Flag/moderate buttons (added inline on reviews)
 *
 * Server component: queries catalog + community data in parallel, hydrates
 * client widgets where interaction is needed (vote buttons, review form).
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseCode } from "@/components/ui/course-code";
import { getSession } from "@/lib/auth/get-session";
import { getDifficultySummary, getUserVote } from "@/lib/community/difficulty";
import { getCourseReviews } from "@/lib/community/reviews";
import { getCachedSummary } from "@/lib/community/summaries";
import { db } from "@/lib/data/db";
import { courses } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DifficultyVote } from "./difficulty-vote";
import { ProfessorReviews } from "./reviews";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

const COURSE_CODE_RX = /^[A-Z]{3,4}\s\d{3,4}[A-Z]?$/;

/** Meridian category accent + human label, mirroring the design source. */
const CATEGORY_META: Record<string, { color: string; label: string }> = {
  se_core: { color: "var(--accent)", label: "SE Core" },
  eng_core: { color: "var(--info)", label: "Engineering Core" },
  soen_elective: { color: "oklch(0.6 0.15 330)", label: "SOEN Elective" },
  deficiency: { color: "var(--bad)", label: "Deficiency" },
  nat_sci_elective: { color: "var(--ok)", label: "Natural Science Elective" },
  gen_ed_humanities: { color: "var(--warn)", label: "Gen Ed / Humanities" },
  eng_nsci_group: { color: "var(--ok)", label: "Eng / Nat Sci Group" },
};

export async function generateMetadata({ params }: PageProps): Promise<{ title: string }> {
  const { code } = await params;
  return { title: `${decodeURIComponent(code)} — Compass` };
}

export default async function CourseDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toUpperCase();
  if (!COURSE_CODE_RX.test(code)) notFound();

  const [courseRow, summaryRow, difficulty, userVote, reviews] = await Promise.all([
    db
      .select()
      .from(courses)
      .where(eq(courses.code, code))
      .then((rows) => rows[0]),
    getCachedSummary(code),
    getDifficultySummary(code),
    getUserVote(session.user.id, code),
    getCourseReviews(code),
  ]);

  if (!courseRow) notFound();

  const catMeta = CATEGORY_META[courseRow.category ?? ""] ?? {
    color: "var(--ink-3)",
    label: courseRow.category ?? "Course",
  };
  const prereqsAll = courseRow.prereqs?.all ?? [];
  const prereqsAny = courseRow.prereqs?.any ?? [];
  const prereqList = [...prereqsAll, ...prereqsAny];
  const prereqNotes = courseRow.prereqs?.notes;

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1100px] mx-auto space-y-8">
      {/* header — boxed category-colored code chip + credits + category dot */}
      <header className="card-hard p-6 sm:p-8 rise" style={{ background: "var(--paper)" }}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span
            className="mono inline-flex items-center rounded-[8px] px-[11px] py-[5px] text-[16px] font-bold tracking-[0.02em]"
            style={{ background: catMeta.color, color: "var(--on-accent)" }}
          >
            {courseRow.code}
          </span>
          <Badge variant="secondary">
            <span className="mono tnum">{courseRow.credits}</span> credits
          </Badge>
          {courseRow.avgHoursPerWeek ? (
            <Badge variant="info">
              <span className="mono tnum">~{courseRow.avgHoursPerWeek}</span>h / week
            </Badge>
          ) : null}
        </div>
        <h1
          className="font-heading text-[26px] sm:text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] mb-3"
          style={{ color: "var(--ink)" }}
        >
          {courseRow.title}
        </h1>
        <span
          className="inline-flex items-center gap-1.5 text-[12.5px]"
          style={{ color: "var(--ink-2)" }}
        >
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: catMeta.color }}
            aria-hidden
          />
          {catMeta.label}
        </span>
      </header>

      {courseRow.description && (
        <div className="card flex gap-2.5 p-3.5" style={{ background: "var(--surface-2)" }}>
          <span
            className="mt-0.5 shrink-0 text-base leading-none"
            style={{ color: "var(--ink-3)" }}
            aria-hidden
          >
            ⓘ
          </span>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {courseRow.description}
          </p>
        </div>
      )}

      {/* prerequisites / unlocks */}
      <section className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="eyebrow mb-2.5">Prerequisites</div>
          <div className="flex flex-wrap gap-1.5">
            {prereqList.length > 0 ? (
              prereqList.map((p) => (
                <Link key={p} href={`/courses/${encodeURIComponent(p)}`}>
                  <CourseCode code={p} onClick={() => undefined} />
                </Link>
              ))
            ) : (
              <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                None — open entry
              </span>
            )}
          </div>
          {prereqsAny.length > 0 && prereqsAll.length > 0 && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              <span className="mono">all</span> of the first group required;{" "}
              <span className="mono">any</span> of the rest.
            </p>
          )}
          {prereqNotes && (
            <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
              {prereqNotes}
            </p>
          )}
        </div>
        <div>
          <div className="eyebrow mb-2.5">Offered</div>
          <div className="flex flex-wrap gap-1.5">
            {courseRow.offeredFall && <Badge variant="secondary">Fall</Badge>}
            {courseRow.offeredWinter && <Badge variant="secondary">Winter</Badge>}
            {courseRow.offeredSummer && <Badge variant="secondary">Summer</Badge>}
          </div>
        </div>
      </section>

      {/* community — "What students are saying" */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-7 w-7 place-items-center rounded-[7px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            aria-hidden
          >
            ✦
          </span>
          <h2
            className="font-heading text-base font-semibold tracking-[-0.01em]"
            style={{ color: "var(--ink)" }}
          >
            What students are saying
          </h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How hard was it?</CardTitle>
          </CardHeader>
          <CardContent>
            <DifficultyVote
              courseCode={code}
              initialSummary={difficulty}
              initialUserVote={userVote}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Professor reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfessorReviews courseCode={code} initial={reviews} />
          </CardContent>
        </Card>

        {summaryRow ? <RedditSummaryBlock row={summaryRow} /> : <NoCommunityData code={code} />}
      </section>
    </div>
  );
}

function NoCommunityData({ code }: { code: string }): React.ReactElement {
  return (
    <div
      className="rounded-[var(--r-md)] border-[1.5px] border-dashed px-5 py-7 text-center"
      style={{ borderColor: "var(--line-strong)", background: "var(--surface-2)" }}
    >
      <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        No Reddit discussion summarized yet for {code}. Admins can run
      </p>
      <div className="flex flex-col items-center gap-1.5">
        <code
          className="mono rounded-md px-1.5 py-0.5 text-xs"
          style={{
            background: "var(--surface)",
            color: "var(--ink)",
            border: "1.2px solid var(--line-strong)",
          }}
        >
          npm run scrape:reddit -- --code "{code}"
        </code>
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          then
        </span>
        <code
          className="mono rounded-md px-1.5 py-0.5 text-xs"
          style={{
            background: "var(--surface)",
            color: "var(--ink)",
            border: "1.2px solid var(--line-strong)",
          }}
        >
          npm run summarize:reddit -- --code "{code}"
        </code>
      </div>
    </div>
  );
}

function RedditSummaryBlock({
  row,
}: {
  row: NonNullable<Awaited<ReturnType<typeof getCachedSummary>>>;
}): React.ReactElement {
  const s = row.summary;
  return (
    <div className="space-y-4">
      {/* accent-wash AI-summary card with source Badges */}
      <div
        className="card p-4"
        style={{
          background: "linear-gradient(120deg, var(--accent-soft), transparent 80%)",
          borderColor: "color-mix(in oklch, var(--accent) 28%, transparent)",
        }}
      >
        <div className="eyebrow mb-2.5" style={{ color: "var(--accent-deep)" }}>
          AI summary
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Sentiment: {s.sentiment.replace(/_/g, " ")}</Badge>
          <Badge variant="accent">Difficulty: {s.difficultyEstimate}</Badge>
          <Badge variant="secondary">
            <span className="mono tnum">{s.postsConsidered}</span> post(s)
          </Badge>
          {row.isStale && <Badge variant="warning">refresh queued</Badge>}
        </div>
      </div>

      {s.profMentions.length > 0 && (
        <section>
          <div className="eyebrow mb-2.5">Professors mentioned</div>
          <ul className="space-y-1.5 text-sm">
            {s.profMentions.slice(0, 6).map((m) => (
              <li
                key={m.name}
                className="flex items-center justify-between gap-2 rounded-[var(--r-md)] border-[1.5px] px-3 py-2"
                style={{ background: "var(--surface)", borderColor: "var(--line)" }}
              >
                <span className="font-medium" style={{ color: "var(--ink)" }}>
                  {m.name}
                </span>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                  <span className="mono tnum">{m.count}</span> mention{m.count === 1 ? "" : "s"} ·{" "}
                  {m.sentiment}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ListBlock title="Common praise" items={s.commonPraise} />
      <ListBlock title="Common complaints" items={s.commonComplaints} />

      {s.citations.length > 0 && (
        <section>
          <div className="eyebrow mb-2.5">From the threads</div>
          <ul className="space-y-2 text-sm">
            {s.citations.map((c) => (
              <li
                key={c.permalink}
                className="rounded-[var(--r-md)] border-[1.5px] px-3 py-2.5"
                style={{ background: "var(--surface)", borderColor: "var(--line)" }}
              >
                <a
                  href={c.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono break-words text-xs underline transition-colors"
                  style={{ color: "var(--accent-deep)" }}
                >
                  {c.permalink}
                </a>
                <p className="mt-1.5 italic" style={{ color: "var(--ink)" }}>
                  “{c.quote}”
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ListBlock({
  title,
  items,
}: { title: string; items: string[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="eyebrow mb-2.5">{title}</div>
      <ul className="space-y-1.5 text-sm">
        {items.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--accent)" }}
              aria-hidden
            />
            <span style={{ color: "var(--ink)" }}>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
