"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, GraduationCap, RefreshCw, Sparkles } from "lucide-react";
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
    <div className="animate-rise">
      {/* Section header — eyebrow kicker + Bricolage title + AI-ranked badge */}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1.5">Pipeline: eligibility → similarity → LLM top-5</div>
          <h2 className="font-heading text-[21px] font-semibold tracking-[-0.02em]">
            Recommended for you
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="gap-1">
            <Sparkles className="size-3" aria-hidden />
            AI-ranked
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchRecs}
            disabled={loading}
            aria-label="Refresh recommendations"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading || recs === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 stagger">
          {[1, 2, 3, 4, 5].map((i, idx) => (
            <div
              key={i}
              style={{ ["--i" as string]: idx }}
              className="card animate-rise p-[18px] space-y-2.5"
            >
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : recs.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 border-dashed px-6 py-10 text-center">
          <span
            className="inline-grid h-11 w-11 place-items-center rounded-xl"
            style={{ background: "var(--accent-soft)" }}
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
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 stagger">
          {recs.map((r, idx) => (
            <li
              key={r.code}
              style={{ ["--i" as string]: idx }}
              className="lift card animate-rise flex flex-col gap-2.5 p-[18px] transition-all hover:border-[var(--line-strong)] hover:shadow-[var(--hard-shadow)]"
            >
              <div className="flex items-center justify-between">
                <CourseCode code={r.code} />
                <Badge variant="success">{Math.round(r.score * 100)}% fit</Badge>
              </div>
              <p
                className="text-[14.5px] font-bold leading-[1.25]"
                style={{ color: "var(--color-text)" }}
              >
                {r.title}
              </p>
              <p
                className="flex-1 text-[13px] leading-[1.5]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {r.why}
              </p>
              <div className="mt-0.5 flex items-center justify-between">
                {r.category ? (
                  <Badge variant="secondary" className="capitalize">
                    {r.category.replace(/_/g, " ")}
                  </Badge>
                ) : (
                  <span
                    className="mono tnum text-[12px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {r.credits}cr
                  </span>
                )}
                <span
                  className="flex items-center gap-1.5 text-[12.5px] font-[650]"
                  style={{ color: "var(--accent-deep)" }}
                >
                  View <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
