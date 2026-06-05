import { ThemeToggle } from "@/components/providers/theme-toggle";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { getSession } from "@/lib/auth/get-session";
import {
  ArrowRight,
  Calendar,
  Check,
  CheckSquare,
  GripVertical,
  MessageSquare,
  Network,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

const FEATURES = [
  {
    icon: Calendar,
    kicker: "Plan",
    title: "Term planner",
    body: "Drag courses across Fall 2026 → Winter 2030. Live workload prediction flags burnout terms before they happen.",
  },
  {
    icon: MessageSquare,
    kicker: "Ask",
    title: "Ask Compass",
    body: "Streaming answers grounded in the catalog and your plan, with numbered citations you can verify.",
  },
  {
    icon: Network,
    kicker: "Trace",
    title: "Prereq map",
    body: "A deterministic dependency graph. Click any course to trace exactly what it needs and what it unlocks.",
  },
  {
    icon: CheckSquare,
    kicker: "Track",
    title: "Requirements",
    body: "Per-category progress against Concordia §71.70.9, plus community reviews and difficulty votes.",
  },
] as const;

const STATS = [
  ["124", "courses in the catalog"],
  ["370", "tests passing"],
  ["$0", "per month to run"],
  ["4", "AI models, one router"],
] as const;

export default async function Home(): Promise<React.ReactElement> {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div
      className="scroll relative flex min-h-screen flex-col overflow-x-hidden"
      style={{ background: "var(--paper)" }}
    >
      {/* Sticky editorial nav */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3.5 px-6 py-4 sm:px-8"
        style={{
          background: "color-mix(in oklch, var(--paper) 84%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1.5px solid var(--line)",
        }}
      >
        <Link href="/" className="flex items-center gap-3.5" aria-label="SOEN Compass home">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} className="dark:hidden" />
          <Image
            src="/brand/mark-reverse.svg"
            alt=""
            width={32}
            height={32}
            className="hidden dark:block"
          />
          <span
            className="text-[19px] font-extrabold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Compass
          </span>
        </Link>
        <span
          className="mono rounded-full px-[7px] py-0.5 text-[10.5px] tracking-[0.08em]"
          style={{ color: "var(--ink-3)", border: "1.5px solid var(--line-strong)" }}
        >
          SOEN
        </span>
        <nav
          className="ml-6 hidden items-center gap-[22px] text-sm font-[550] md:flex"
          style={{ color: "var(--ink-2)" }}
        >
          {["Planner", "Ask Compass", "Prereq map", "Community"].map((x) => (
            <span key={x} className="cursor-default">
              {x}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="accent" size="sm" data-icon="inline-end">
              Get started
              <ArrowRight />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-[1180px] items-center gap-12 px-6 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-16 lg:pb-24">
        <div className="rise">
          <span
            className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-[5px]"
            style={{ border: "1.5px solid var(--line-strong)", background: "var(--surface)" }}
          >
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: "var(--ok)" }}
              aria-hidden
            />
            <span className="text-[12.5px] font-semibold">
              Free &amp; open source · Llama 3.3 70B
            </span>
          </span>

          <Image
            src="/brand/lockup.svg"
            alt="SOEN Compass"
            width={260}
            height={56}
            priority
            className="mb-6 dark:hidden"
          />
          <Image
            src="/brand/lockup-reverse.svg"
            alt="SOEN Compass"
            width={260}
            height={56}
            priority
            className="mb-6 hidden dark:block"
          />

          <h1
            className="mb-5 text-balance"
            style={{
              fontSize: "clamp(2.6rem, 1.6rem + 3.4vw, 4.4rem)",
              lineHeight: 1.0,
              letterSpacing: "-0.035em",
            }}
          >
            Plan your Software Engineering degree like a{" "}
            <span style={{ color: "var(--accent-deep)" }}>cartographer.</span>
          </h1>
          <p
            className="mb-7 max-w-[480px] text-lg leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            An AI degree planner for Concordia Software Engineering. Drag-and-drop terms, a
            deterministic prereq map, real-time validation, and a chatbot that cites the calendar —
            chapter and verse.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="accent" size="lg" data-icon="inline-end">
                Open the planner
                <ArrowRight />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" data-icon="inline-start">
                <MessageSquare />
                Try Ask Compass
              </Button>
            </Link>
          </div>

          <p
            className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            style={{ color: "var(--ink-3)" }}
          >
            <span className="mono tnum">v0.1.0</span>
            <span aria-hidden>·</span>
            <span>Invite-only beta</span>
            <span aria-hidden>·</span>
            <span>Free forever for students</span>
          </p>
        </div>

        {/* Hero preview collage */}
        <div className="rise hidden lg:block" style={{ animationDelay: ".1s" }} aria-hidden>
          <div className="relative">
            {/* Insight card */}
            <div
              className="card card-hard p-5"
              style={{
                background: "linear-gradient(120deg, var(--accent-soft), transparent 70%)",
                borderColor: "color-mix(in oklch, var(--accent) 30%, transparent)",
              }}
            >
              <div className="mb-[11px] flex items-center gap-2.5">
                <span
                  className="grid h-[26px] w-[26px] place-items-center rounded-[7px]"
                  style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                >
                  <Sparkles className="h-[15px] w-[15px]" />
                </span>
                <span className="eyebrow" style={{ color: "var(--accent-deep)" }}>
                  Insight of the day
                </span>
              </div>
              <p
                className="text-[15.5px] font-medium leading-snug"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Your heaviest stretch is Winter 2027 → Fall 2027 — smoothing one course into summer
                cuts your peak week from 35h to 28h.
              </p>
            </div>

            {/* Floating term card */}
            <div
              className="card card-hard absolute -right-[18px] -bottom-[26px] w-[210px] p-3.5"
              style={{ background: "var(--surface)" }}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span
                  className="text-[13px] font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Winter 2027
                </span>
                {/* Workload badge — heavy */}
                <span
                  className="inline-flex items-center gap-[7px] rounded-full px-2 py-[3px] text-[11.5px] font-bold"
                  style={{
                    background: "var(--warn-soft)",
                    border: "1px solid color-mix(in oklch, var(--warn) 40%, transparent)",
                    color: "color-mix(in oklch, var(--warn) 80%, var(--ink))",
                  }}
                >
                  <span className="inline-flex items-end gap-0.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-1 rounded-[1px]"
                        style={{
                          height: 9,
                          background:
                            i < 3
                              ? "var(--warn)"
                              : "color-mix(in oklch, var(--warn) 22%, transparent)",
                        }}
                      />
                    ))}
                  </span>
                  Heavy
                  <span className="mono opacity-70">35h</span>
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {["COMP 352", "COMP 348", "MATH 205"].map((c) => (
                  <div
                    key={c}
                    className="flex items-center gap-[7px] rounded-[7px] px-2 py-1.5"
                    style={{
                      background: "var(--surface-2)",
                      border: "1.5px solid var(--line)",
                    }}
                  >
                    <GripVertical className="h-[13px] w-[13px]" style={{ color: "var(--ink-3)" }} />
                    <CourseCode code={c} />
                  </div>
                ))}
              </div>
            </div>

            {/* Prereqs validated ink tab */}
            <div
              className="card card-hard absolute -top-[22px] -left-[26px] flex items-center gap-2.5 px-3.5 py-2.5"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              <Check className="h-4 w-4" style={{ color: "var(--accent)" }} />
              <span className="text-[12.5px] font-[650]">Prereqs validated</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section
        style={{
          borderTop: "1.5px solid var(--line)",
          borderBottom: "1.5px solid var(--line)",
          background: "var(--paper-2)",
        }}
      >
        <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-6 px-6 py-7 sm:px-8 md:grid-cols-4">
          {STATS.map(([n, l]) => (
            <div key={l}>
              <div
                className="mono text-[34px] font-bold tracking-[-0.03em]"
                style={{ color: "var(--accent-deep)" }}
              >
                {n}
              </div>
              <div className="mt-0.5 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                {l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-[1180px] px-6 py-[72px] sm:px-8">
        <div className="mb-10 text-center">
          <div className="eyebrow mb-2.5">Everything in one place</div>
          <h2
            style={{
              fontSize: "clamp(1.9rem, 1.4rem + 1.6vw, 2.8rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Built for the whole four years
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Link
                key={f.title}
                href="/signup"
                className="lift card flex flex-col gap-[11px] p-[22px] text-left"
              >
                <span
                  className="grid h-[42px] w-[42px] place-items-center rounded-[var(--r-md)]"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent-deep)",
                    border: "1.5px solid color-mix(in oklch, var(--accent) 30%, transparent)",
                  }}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <div className="eyebrow">{f.kicker}</div>
                <h3 className="text-[18.5px] tracking-[-0.02em]">{f.title}</h3>
                <p className="flex-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {f.body}
                </p>
                <span
                  className="flex items-center gap-1.5 text-[13px] font-[650]"
                  style={{ color: "var(--accent-deep)" }}
                >
                  Explore <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mb-20 w-full max-w-[1180px] px-6 sm:px-8">
        <div
          className="card card-hard relative overflow-hidden px-10 py-[54px] text-center"
          style={{
            background: "linear-gradient(130deg, var(--accent-soft), transparent 70%)",
            borderColor: "color-mix(in oklch, var(--accent) 32%, transparent)",
          }}
        >
          <div
            className="pointer-events-none absolute -bottom-10 -left-[30px]"
            style={{ opacity: 0.08, color: "var(--accent)" }}
            aria-hidden
          >
            <svg width="220" height="220" viewBox="0 0 40 40" fill="none" role="presentation">
              <circle cx="20" cy="20" r="18" fill="currentColor" />
              <path d="M20 8 L24 20 L20 32 L16 20 Z" fill="var(--ink)" />
              <circle cx="20" cy="20" r="2.2" fill="var(--ink)" />
            </svg>
          </div>
          <h2
            className="relative mb-3.5"
            style={{ fontSize: "clamp(2rem, 1.4rem + 2vw, 3rem)", letterSpacing: "-0.03em" }}
          >
            Stop guessing. Start charting.
          </h2>
          <p
            className="relative mx-auto mb-7 max-w-[520px] text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            Explore the planner with a sample SOEN plan and the live validation engine — free
            forever for students.
          </p>
          <div className="relative inline-flex">
            <Link href="/signup">
              <Button variant="accent" size="lg" data-icon="inline-end">
                Get started — it&apos;s free
                <ArrowRight />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-3 px-6 py-7 sm:px-8"
        style={{ borderTop: "1.5px solid var(--line)" }}
      >
        <Image src="/brand/mark.svg" alt="" width={26} height={26} className="dark:hidden" />
        <Image
          src="/brand/mark-reverse.svg"
          alt=""
          width={26}
          height={26}
          className="hidden dark:block"
        />
        <span className="font-bold">Compass</span>
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Not affiliated with Concordia University · MIT licensed
        </span>
        <span className="mono ml-auto text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Meridian redesign · 2026
        </span>
      </footer>
    </div>
  );
}
