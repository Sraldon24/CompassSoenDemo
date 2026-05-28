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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Prereq Map</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Hover a course to highlight everything connected to it. Solid arrows = hard prereqs;
          dashed = co-requisites (concurrent OK).
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className="text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: filter === f.value ? "var(--color-accent)" : "var(--color-border)",
              background: filter === f.value ? "var(--color-accent-soft)" : "var(--color-surface)",
              color: filter === f.value ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <PrereqMapSVG
        catalog={visibleCatalog}
        takenCodes={taken}
        plannedCodes={planned}
        filterCategory={null}
      />

      <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
            style={{ background: "var(--color-success)" }}
          />
          Done
        </span>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
            style={{ background: "var(--color-accent)" }}
          />
          In your plan
        </span>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
            style={{ background: "var(--color-text-muted)" }}
          />
          Available
        </span>
        <span>·</span>
        <span>{catalog.length} total courses</span>
      </div>
    </div>
  );
}
