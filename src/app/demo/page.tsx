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
      <div className="glass sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 text-sm ring-hairline shadow-[var(--shadow-sm)]">
        <span>
          <strong>Demo mode</strong> — this is a sample plan. Sign up to build your own.
        </span>
        <Link
          href="/signup"
          className="pressable shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-sm)]"
          style={{ background: "var(--gradient-accent)", color: "white" }}
        >
          Sign up free
        </Link>
      </div>

      <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-6 animate-rise">
        <header className="space-y-2">
          <p className="eyebrow">Live demo</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">
            SOEN Compass demo
          </h1>
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
