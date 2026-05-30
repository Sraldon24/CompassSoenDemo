/**
 * /u/[slug] — public, no-auth profile page.
 *
 * Renders a student's degree progress for sharing (Reddit, LinkedIn, etc.).
 * Only visible when the profile has isPublic=true. Respects the per-field
 * privacy toggles via getPublicProfileBySlug().
 *
 * This route lives at the app root (not under (dashboard)) so it uses the
 * bare root layout — no sidebar, no auth gate.
 */

import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { getPublicProfileBySlug } from "@/lib/community/public-profile";
import { TOTAL_DEGREE_CREDITS } from "@/lib/requirements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProfileBySlug(slug);
  if (!profile) return { title: "Profile not found — SOEN Compass" };

  const title = `${profile.displayName} — SOEN Compass`;
  const description = `${profile.displayName}'s Concordia ${profile.program ?? "SOEN"} degree progress: ${profile.creditsEarned}/${TOTAL_DEGREE_CREDITS} credits.`;
  const ogImage = `/u/${slug}/opengraph-image`;

  return {
    title,
    description,
    openGraph: { title, description, images: [ogImage] },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function PublicProfilePage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { slug } = await params;
  const profile = await getPublicProfileBySlug(slug);
  if (!profile) notFound();

  // Fire-and-forget: count the view (distinctId = slug since visitor is anon).
  void trackServer(`profile:${slug}`, ANALYTICS_EVENTS.public_profile_view, { slug });

  const pct = Math.min(100, Math.round((profile.creditsEarned / TOTAL_DEGREE_CREDITS) * 100));

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: "var(--color-bg)" }}>
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{profile.displayName}</h1>
          {profile.program && (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Concordia · {profile.program}
            </p>
          )}
          {profile.bio && <p className="text-sm leading-relaxed">{profile.bio}</p>}
          <div className="flex gap-3 text-sm">
            {profile.githubUrl && (
              <a
                href={profile.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                GitHub
              </a>
            )}
            {profile.linkedinUrl && (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                LinkedIn
              </a>
            )}
          </div>
        </header>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Degree progress</span>
            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {profile.creditsEarned} / {TOTAL_DEGREE_CREDITS} credits ({pct}%)
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "var(--color-surface-muted)" }}
          >
            <div
              className="h-full"
              style={{ width: `${pct}%`, background: "var(--color-accent, #2f7d5b)" }}
            />
          </div>
        </section>

        <CourseSection
          title={`Completed (${profile.completed.length})`}
          courses={profile.completed}
        />
        {profile.showFuturePlan && profile.planned.length > 0 && (
          <CourseSection title={`Planned (${profile.planned.length})`} courses={profile.planned} />
        )}

        <footer className="pt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
          <Link href="/" className="underline">
            Built with SOEN Compass
          </Link>{" "}
          — an AI degree planner for Concordia BEng SOEN students.
        </footer>
      </div>
    </main>
  );
}

function CourseSection({
  title,
  courses,
}: {
  title: string;
  courses: Array<{ code: string; title: string; credits: number; term: string | null }>;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h2
        className="text-sm font-medium uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </h2>
      <ul className="space-y-1">
        {courses.map((c) => (
          <li
            key={`${c.code}-${c.term ?? ""}`}
            className="flex items-baseline justify-between gap-3 text-sm py-1 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span className="font-mono shrink-0">{c.code}</span>
            <span className="flex-1 truncate" style={{ color: "var(--color-text-muted)" }}>
              {c.title}
            </span>
            {c.term && <span className="text-xs shrink-0">{c.term}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
