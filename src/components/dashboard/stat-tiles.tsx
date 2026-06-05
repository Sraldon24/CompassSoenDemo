"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CircleDot,
  GraduationCap,
  Layers,
  type LucideIcon,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Icon registry. The icon is referenced by a STRING key (not the component
 * itself) because StatTile data is built in a server component and passed to
 * this client component — and React components/functions can't cross the
 * server→client boundary ("Functions cannot be passed to Client Components").
 */
const ICONS = {
  graduation: GraduationCap,
  inProgress: CircleDot,
  planned: Layers,
  remaining: TrendingUp,
  deficiency: AlertTriangle,
} as const satisfies Record<string, LucideIcon>;

export type StatIconKey = keyof typeof ICONS;

export type StatTile = {
  label: string;
  value: number;
  /** key into the icon registry (string — safe to pass from server) */
  icon: StatIconKey;
  /** css color (var(--…)) for the icon + accent */
  color: string;
  /** optional suffix, e.g. "cr" or "%" */
  suffix?: string;
};

/** Honor reduced-motion: skip the count-up and render the final value. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Eased count-up from 0 → target over ~700ms on mount. */
function useCountUp(target: number, enabled: boolean): number {
  const [n, set] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      set(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const dur = 700;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / dur);
      // easeOutCubic
      const eased = 1 - (1 - p) ** 3;
      set(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return n;
}

function Tile({ tile, index }: { tile: StatTile; index: number }): React.ReactElement {
  const reduced = usePrefersReducedMotion();
  const value = useCountUp(tile.value, !reduced);
  const Icon = ICONS[tile.icon];
  // First tile is accent-tinted to anchor the row (Meridian).
  const accent = index === 0;
  return (
    <Card
      interactive
      size="sm"
      style={{
        ["--i" as string]: index,
        ...(accent
          ? {
              background: "var(--accent-soft)",
              borderColor: "color-mix(in oklch, var(--accent) 38%, transparent)",
            }
          : {}),
      }}
      className="card-hard animate-rise"
    >
      <CardContent className="p-[18px]">
        <div className="flex items-center justify-between">
          <div className="eyebrow">{tile.label}</div>
          <div
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg ring-hairline"
            style={{ background: "var(--surface)" }}
          >
            <Icon className="h-4 w-4" style={{ color: tile.color }} aria-hidden />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span
            className="mono tnum text-[30px] font-bold leading-none"
            style={{ color: accent ? "var(--accent-deep)" : "var(--ink)" }}
          >
            {value}
          </span>
          {tile.suffix && (
            <span
              className="mono text-[15px] font-semibold"
              style={{ color: accent ? "var(--accent-deep)" : "var(--ink-3)" }}
            >
              {tile.suffix}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatTiles({ tiles }: { tiles: StatTile[] }): React.ReactElement {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
      {tiles.map((t, i) => (
        <Tile key={t.label} tile={t} index={i} />
      ))}
    </div>
  );
}
