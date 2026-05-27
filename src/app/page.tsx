import { ThemeToggle } from "@/components/theme-toggle";
import Image from "next/image";

export default function Home(): React.ReactElement {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-end px-6 py-4">
        <ThemeToggle />
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="flex flex-col items-center gap-8 text-center max-w-2xl">
          <Image
            src="/brand/lockup.svg"
            alt="SOEN Compass"
            width={220}
            height={48}
            priority
            className="dark:hidden"
          />
          <Image
            src="/brand/lockup-reverse.svg"
            alt="SOEN Compass"
            width={220}
            height={48}
            priority
            className="hidden dark:block"
          />

          <h1 className="text-4xl font-semibold tracking-tight">
            Plan your Software Engineering degree the smart way.
          </h1>

          <p className="text-lg text-muted-foreground">
            An AI-powered degree planner for Concordia BEng Software Engineering students.
            Drag-and-drop term planning, AI chatbot, interactive prerequisite map, and community
            insights.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4 text-sm text-muted-foreground">
            <span className="mono tnum">v0.1.0</span>
            <span className="hidden sm:inline">·</span>
            <span>Phase 1 — scaffold</span>
            <span className="hidden sm:inline">·</span>
            <span>
              <span className="mono tnum">0</span> / <span className="mono tnum">120</span> credits
              planned
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
