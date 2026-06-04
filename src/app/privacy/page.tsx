/**
 * /privacy — public privacy policy. No auth. Linked from the cookie banner +
 * footer. Plain prose; not legal advice, written for a student side-project.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — SOEN Compass",
  description: "How SOEN Compass handles your data.",
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="min-h-screen px-4 py-12" style={{ background: "var(--color-bg)" }}>
      <article className="max-w-2xl mx-auto space-y-6 text-sm leading-relaxed animate-rise">
        <header className="space-y-1.5">
          <p className="eyebrow">Legal</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Privacy Policy</h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Last updated: 2026-05-30
          </p>
        </header>

        <Section title="Who we are">
          SOEN Compass is a free, open-source degree planner for Concordia BEng Software Engineering
          students, built by a Concordia student. It is not affiliated with or endorsed by Concordia
          University.
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Account:</strong> your email and (optionally) name, to sign you in and save
              your plan.
            </li>
            <li>
              <strong>Plan data:</strong> the courses, terms, and grades you add. This is yours; we
              use it only to show your plan and power the AI advisor.
            </li>
            <li>
              <strong>Reviews &amp; votes:</strong> anonymous by default; we store your user id with
              them only for moderation, never to display.
            </li>
            <li>
              <strong>Analytics:</strong> anonymized usage events (e.g. "plan created") — only if
              you accept analytics cookies. We honor Do-Not-Track.
            </li>
          </ul>
        </Section>

        <Section title="What we do NOT do">
          <ul className="list-disc pl-5 space-y-1">
            <li>We never sell your data.</li>
            <li>We don't scrape RateMyProfessors or import grades without your action.</li>
            <li>We don't show your name on reviews you mark anonymous.</li>
          </ul>
        </Section>

        <Section title="AI features">
          When you use the chat, recommendations, or email drafting, your prompt and relevant plan
          context are sent to our AI provider (Groq) to generate a response. We store the
          conversation so you can revisit it. We don't use your data to train models.
        </Section>

        <Section title="Community content">
          Reddit discussion summaries shown on course pages are derived from public posts on
          r/Concordia and link back to the originals. We summarize; we don't republish full posts.
        </Section>

        <Section title="Your controls">
          <ul className="list-disc pl-5 space-y-1">
            <li>Make your profile public or private anytime in Settings → Privacy.</li>
            <li>Export all your data as JSON (Settings → Privacy).</li>
            <li>Delete your account; we purge your data after a 30-day grace period.</li>
            <li>Reject analytics cookies via the banner — the app still works fully.</li>
          </ul>
        </Section>

        <Section title="Contact">
          Questions? Email{" "}
          <a
            href="mailto:sraldon24@gmail.com"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            sraldon24@gmail.com
          </a>
          .
        </Section>

        <footer
          className="pt-6 mt-2 border-t"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <Link
            href="/"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            ← Back to SOEN Compass
          </Link>{" "}
          ·{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            Terms of Service
          </Link>
        </footer>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="space-y-2">
      <h2 className="text-base sm:text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      <div style={{ color: "var(--color-text)" }}>{children}</div>
    </section>
  );
}
