import { ThemeToggle } from "@/components/providers/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/get-session";
import { Calendar, MessageSquare, Network, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

const FEATURES = [
  {
    icon: Calendar,
    title: "Drag-and-drop planning",
    body: "Lay out every term, watch prereq violations light up instantly, and balance workload before you register.",
  },
  {
    icon: MessageSquare,
    title: "Ask Compass anything",
    body: "An AI advisor that knows the SOEN catalog, your plan, and what students actually say about each course.",
  },
  {
    icon: Network,
    title: "Interactive prereq map",
    body: "See the whole dependency graph of your degree — what unlocks what, and the fastest path through it.",
  },
] as const;

export default async function Home(): Promise<React.ReactElement> {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Animated emerald aurora behind everything */}
      <div className="aurora-bg" aria-hidden />
      {/* Faint dotted grid under the hero */}
      <div className="absolute inset-x-0 top-0 h-[70vh] grid-backdrop" aria-hidden />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2" aria-label="SOEN Compass home">
          <Image src="/brand/mark.svg" alt="" width={28} height={28} className="dark:hidden" />
          <Image
            src="/brand/mark-reverse.svg"
            alt=""
            width={28}
            height={28}
            className="hidden dark:block"
          />
          <span className="text-[15px] font-semibold tracking-tight">Compass</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="accent" size="sm">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center px-6 pb-20">
        <section className="flex flex-col items-center gap-7 text-center max-w-2xl mt-12 sm:mt-20 animate-rise">
          {/* Invite-only pill */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "var(--gradient-accent-soft)", color: "var(--color-accent)" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI degree planner for Concordia SOEN
          </span>

          <Image
            src="/brand/lockup.svg"
            alt="SOEN Compass"
            width={260}
            height={56}
            priority
            className="dark:hidden"
          />
          <Image
            src="/brand/lockup-reverse.svg"
            alt="SOEN Compass"
            width={260}
            height={56}
            priority
            className="hidden dark:block"
          />

          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
            Plan your Software Engineering degree the{" "}
            <span className="text-gradient">smart way.</span>
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Drag-and-drop term planning, an AI chatbot that knows your plan, an interactive
            prerequisite map, and real community insights — built for Concordia BEng SOEN students.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
            <Link href="/signup">
              <Button variant="accent" size="lg" className="h-11 px-6 text-base">
                Get started — it&apos;s free
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-11 px-6 text-base">
                I have an account
              </Button>
            </Link>
          </div>

          <p
            className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-sm mt-1"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <span className="mono tnum">v0.1.0</span>
            <span aria-hidden>·</span>
            <span>Invite-only beta</span>
            <span aria-hidden>·</span>
            <span>Free forever for students</span>
          </p>
        </section>

        {/* Feature highlight cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl w-full mt-16 sm:mt-24 stagger">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                style={{ ["--i" as string]: i }}
                className="lift rounded-xl border p-6 text-left bg-card ring-1 ring-foreground/5"
              >
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                  style={{ background: "var(--gradient-accent-soft)" }}
                >
                  <Icon className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{f.title}</h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {f.body}
                </p>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
