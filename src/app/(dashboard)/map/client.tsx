"use client";

import { PrereqMapSVG } from "@/components/prereq-map/prereq-map-svg";
import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { useMemo, useState } from "react";

interface ClientProps {
  catalog: CourseCatalogEntry[];
  takenCodes: string[];
  plannedCodes: string[];
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "my-plan", label: "My Plan" },
  { value: "eng_core", label: "Eng Core" },
  { value: "se_core", label: "SE Core" },
  { value: "soen_elective", label: "SOEN Elec." },
  { value: "nat_sci_elective", label: "Nat Sci" },
  { value: "deficiency", label: "Deficiencies" },
];

export function PrereqMapClient({
  catalog,
  takenCodes,
  plannedCodes,
}: ClientProps): React.ReactElement {
  const [filter, setFilter] = useState<string>("all");
  const taken = useMemo(() => new Set(takenCodes), [takenCodes]);
  const planned = useMemo(() => new Set(plannedCodes), [plannedCodes]);

  const visibleCatalog = useMemo(() => {
    if (filter === "all") return catalog;
    if (filter === "my-plan") {
      const planned = new Set([...takenCodes, ...plannedCodes]);
      return catalog.filter((c) => planned.has(c.code));
    }
    return catalog.filter((c) => c.category === filter);
  }, [filter, catalog, takenCodes, plannedCodes]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1600px] mx-auto space-y-4">
      <header className="relative overflow-hidden rounded-2xl ring-hairline shadow-[var(--shadow-md)] animate-rise">
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div
          className="relative space-y-2 p-6 md:p-8"
          style={{ background: "var(--gradient-surface)" }}
        >
          <p className="eyebrow">DEGREE MAP</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Prereq Map</h1>
          <p className="text-sm max-w-2xl" style={{ color: "var(--color-text-muted)" }}>
            Hover a course to highlight everything connected to it. Solid arrows = hard prereqs;
            dashed = co-requisites (concurrent OK).
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 animate-rise" style={{ animationDelay: "60ms" }}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className="pressable text-xs px-3 py-1.5 rounded-full border transition-all duration-200 hover:border-accent/40"
              style={{
                borderColor: active
                  ? "color-mix(in oklch, var(--color-accent) 35%, transparent)"
                  : "var(--color-border)",
                background: active ? "var(--gradient-accent-soft)" : "var(--color-surface)",
                color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                fontWeight: active ? 600 : 400,
                boxShadow: active ? "0 0 14px var(--color-accent-ring)" : "var(--shadow-xs)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <PrereqMapSVG
        catalog={visibleCatalog}
        takenCodes={taken}
        plannedCodes={planned}
        filterCategory={null}
      />

      <div
        className="flex flex-wrap items-center gap-4 rounded-xl ring-hairline shadow-[var(--shadow-sm)] px-4 py-3 text-xs"
        style={{ background: "var(--gradient-surface)", color: "var(--color-text-muted)" }}
      >
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
            style={{
              background: "var(--color-success)",
              boxShadow: "0 0 8px var(--color-success-soft)",
            }}
          />
          Done
        </span>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
            style={{
              background: "var(--color-accent)",
              boxShadow: "0 0 8px var(--color-accent-ring)",
            }}
          />
          In your plan
        </span>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
            style={{ background: "var(--color-text-muted)" }}
          />
          Available
        </span>
        <span style={{ color: "var(--color-text-subtle)" }}>·</span>
        <span>
          <span className="mono tnum" style={{ color: "var(--color-text)" }}>
            {catalog.length}
          </span>{" "}
          total courses
        </span>
      </div>
    </div>
  );
}
