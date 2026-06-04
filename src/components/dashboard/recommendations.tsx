"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Recommendation {
  code: string;
  title: string;
  credits: number;
  category: string | null;
  why: string;
  score: number;
}

export function RecommendationsWidget(): React.ReactElement {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRecs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryFilter: ["soen_elective", "nat_sci_elective"] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to load recommendations");
      }
      const data = (await res.json()) as { payload: { recommendations: Recommendation[] } };
      setRecs(data.payload.recommendations);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (recs === null && !loading) {
      fetchRecs();
    }
  }, [recs, loading, fetchRecs]);

  return (
    <Card className="animate-rise">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-hairline shadow-[var(--shadow-xs)]"
              style={{ background: "var(--gradient-accent-soft)" }}
            >
              <GraduationCap
                className="h-4 w-4"
                style={{ color: "var(--color-accent)" }}
                aria-hidden
              />
            </span>
            Recommended Next Courses
          </CardTitle>
          <CardDescription className="mt-1 pl-[2.625rem]">
            Personalized by interests + prereq distance. Powered by AI.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchRecs}
          disabled={loading}
          aria-label="Refresh recommendations"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading || recs === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
            {[1, 2, 3, 4, 5].map((i, idx) => (
              <div
                key={i}
                style={{ ["--i" as string]: idx, background: "var(--color-surface-2)" }}
                className="rounded-lg ring-hairline shadow-[var(--shadow-xs)] p-3 space-y-2 animate-rise"
              >
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : recs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl ring-hairline shadow-[var(--shadow-xs)]"
              style={{ background: "var(--gradient-accent-soft)" }}
            >
              <GraduationCap
                className="h-5 w-5"
                style={{ color: "var(--color-accent)" }}
                aria-hidden
              />
            </span>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No recommendations yet — add more courses to your plan first.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
            {recs.map((r, idx) => (
              <li
                key={r.code}
                style={{ ["--i" as string]: idx, background: "var(--color-surface)" }}
                className="lift animate-rise rounded-lg ring-hairline shadow-[var(--shadow-xs)] p-3 space-y-1.5 transition-all hover:bg-[var(--color-surface-2)] hover:shadow-[var(--shadow-glow)]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="mono tnum text-sm font-semibold">{r.code}</span>
                  <span
                    className="mono tnum text-[10px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {r.credits}cr
                  </span>
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                  {r.title}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  {r.why}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
