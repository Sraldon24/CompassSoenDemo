/**
 * /demo — no-auth sandbox.
 *
 * Shows a realistic sample SOEN plan with the live validation engine running,
 * plus a capped AI taste-test, so r/Concordia visitors can try Compass before
 * signing up. No DB, no auth — everything is static + client-side.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { DemoBoard } from "./demo-board";

export const metadata: Metadata = {
  title: "Try the demo — SOEN Compass",
  description: "Try the SOEN Compass degree planner with a sample plan — no signup needed.",
};

export default function DemoPage(): React.ReactElement {
  return (
    <main className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b text-sm"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <span>
          <strong>Demo mode</strong> — this is a sample plan. Sign up to build your own.
        </span>
        <Link
          href="/signup"
          className="rounded px-3 py-1.5 text-sm font-medium shrink-0"
          style={{ background: "var(--color-accent, #2f7d5b)", color: "white" }}
        >
          Sign up free
        </Link>
      </div>

      <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">SOEN Compass demo</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            A sample BEng Software Engineering plan with prerequisite checks and workload warnings
            running live. Your real plan would import from your transcript.
          </p>
        </header>

        <DemoBoard />
      </div>
    </main>
  );
}
