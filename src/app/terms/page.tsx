/**
 * /terms — public terms of service. No auth.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — SOEN Compass",
  description: "Terms for using SOEN Compass.",
};

export default function TermsPage(): React.ReactElement {
  return (
    <main className="min-h-screen px-4 py-12" style={{ background: "var(--color-bg)" }}>
      <article className="max-w-2xl mx-auto space-y-6 text-sm leading-relaxed animate-rise">
        <header className="space-y-1.5">
          <p className="eyebrow">Legal</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">
            Terms of Service
          </h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Last updated: 2026-05-30
          </p>
        </header>

        <Section title="The short version">
          SOEN Compass is a free planning tool. It helps you organize courses — it is not official
          academic advising. Always confirm requirements with Concordia and your advisor before
          making registration decisions.
        </Section>

        <Section title="Not official advice">
          Course data, prerequisites, and AI suggestions may be incomplete or out of date. We pull
          from the Concordia calendar and community sources, but the{" "}
          <strong>official Concordia undergraduate calendar is always authoritative</strong>. We are
          not liable for registration decisions made using this tool.
        </Section>

        <Section title="Acceptable use">
          <ul className="list-disc pl-5 space-y-1">
            <li>Be honest and respectful in reviews. No harassment, no naming students.</li>
            <li>Don't abuse the AI features or attempt to overload the service.</li>
            <li>Don't scrape or republish other users' data.</li>
            <li>We may remove content or accounts that violate these terms.</li>
          </ul>
        </Section>

        <Section title="Community content">
          Reviews and votes you submit may be shown publicly (anonymized by default). You keep
          ownership of what you write but grant us a license to display it within the app. Flagged
          content is hidden pending review.
        </Section>

        <Section title="No warranty">
          The service is provided "as is", without warranty of any kind. It's a free student project
          — we do our best, but we can't guarantee uptime or accuracy.
        </Section>

        <Section title="Open source">
          SOEN Compass is MIT-licensed. You're free to read, fork, and self-host the code.
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
            href="/privacy"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            Privacy Policy
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
