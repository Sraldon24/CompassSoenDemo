import { ThemeToggle } from "@/components/providers/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/get-session";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Home(): Promise<React.ReactElement> {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
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
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="flex flex-col items-center gap-8 text-center max-w-2xl">
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
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Plan your Software Engineering degree the smart way.
          </h1>
          <p className="text-lg" style={{ color: "var(--color-text-muted)" }}>
            An AI-powered degree planner for Concordia BEng Software Engineering students.
            Drag-and-drop term planning, AI chatbot, interactive prerequisite map, and community
            insights.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
            <Link href="/signup">
              <Button size="lg">Get started — it&apos;s free</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="ghost">
                I have an account
              </Button>
            </Link>
          </div>
          <p
            className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-sm mt-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="mono tnum">v0.1.0</span>
            <span aria-hidden>·</span>
            <span>Phase 1 — auth ready</span>
          </p>
        </div>
      </main>
    </div>
  );
}
