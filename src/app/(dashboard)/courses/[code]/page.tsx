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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDifficultySummary, getUserVote } from "@/lib/community/difficulty";
import { getCourseReviews } from "@/lib/community/reviews";
import { getCachedSummary } from "@/lib/community/summaries";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { DifficultyVote } from "./difficulty-vote";
import { ProfessorReviews } from "./reviews";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

const COURSE_CODE_RX = /^[A-Z]{3,4}\s\d{3,4}[A-Z]?$/;

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

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1100px] mx-auto space-y-8">
      <header className="space-y-2">
        <div
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          {courseRow.category ?? "Course"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight font-mono">{courseRow.code}</h1>
        <p className="text-xl" style={{ color: "var(--color-text)" }}>
          {courseRow.title}
        </p>
        <div className="flex gap-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <span>{courseRow.credits} credits</span>
          {courseRow.avgHoursPerWeek ? <span>· ~{courseRow.avgHoursPerWeek}h/week</span> : null}
        </div>
      </header>

      {courseRow.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">{courseRow.description}</CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What students are saying</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {summaryRow ? <RedditSummaryBlock row={summaryRow} /> : <NoCommunityData code={code} />}
        </CardContent>
      </Card>
    </div>
  );
}

function NoCommunityData({ code }: { code: string }): React.ReactElement {
  return (
    <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
      No Reddit discussion summarized yet for {code}. Admins can run{" "}
      <code className="font-mono">npm run scrape:reddit -- --code "{code}"</code> followed by{" "}
      <code className="font-mono">npm run summarize:reddit -- --code "{code}"</code>.
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
      <div
        className="flex flex-wrap gap-4 text-xs uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        <span>Sentiment: {s.sentiment.replace(/_/g, " ")}</span>
        <span>· Difficulty: {s.difficultyEstimate}</span>
        <span>· {s.postsConsidered} post(s)</span>
        {row.isStale && <span>· refresh queued</span>}
      </div>

      {s.profMentions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-1">Professors mentioned</h3>
          <ul className="text-sm space-y-1">
            {s.profMentions.slice(0, 6).map((m) => (
              <li key={m.name}>
                <span className="font-medium">{m.name}</span>
                <span className="text-xs ml-2" style={{ color: "var(--color-text-muted)" }}>
                  {m.count} mention{m.count === 1 ? "" : "s"} · {m.sentiment}
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
          <h3 className="text-sm font-semibold mb-1">From the threads</h3>
          <ul className="text-sm space-y-2">
            {s.citations.map((c) => (
              <li key={c.permalink}>
                <a
                  href={c.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-xs break-words"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {c.permalink}
                </a>
                <p className="italic mt-1">“{c.quote}”</p>
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
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <ul className="text-sm list-disc pl-5 space-y-0.5">
        {items.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </section>
  );
}
