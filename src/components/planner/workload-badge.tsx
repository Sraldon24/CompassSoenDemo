"use client";

import type { WorkloadLevel } from "@/lib/domain/workload";

interface WorkloadBadgeProps {
  level: WorkloadLevel;
  hoursPerWeek: number;
}

const LABEL: Record<WorkloadLevel, string> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
  burnout: "Burnout",
};

const COLOR_VAR: Record<WorkloadLevel, string> = {
  light: "var(--color-success)",
  moderate: "var(--color-accent)",
  heavy: "var(--color-warning)",
  burnout: "var(--color-danger)",
};

const SOFT_VAR: Record<WorkloadLevel, string> = {
  light: "var(--color-success-soft)",
  moderate: "var(--color-accent-soft)",
  heavy: "var(--color-warning-soft)",
  burnout: "var(--color-danger-soft)",
};

const FILL_BARS: Record<WorkloadLevel, number> = {
  light: 1,
  moderate: 2,
  heavy: 3,
  burnout: 4,
};

export function WorkloadBadge({ level, hoursPerWeek }: WorkloadBadgeProps): React.ReactElement {
  const accent = COLOR_VAR[level];
  const filled = FILL_BARS[level];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full ring-hairline px-2.5 py-1 text-[11px] font-medium"
      style={{ background: SOFT_VAR[level], color: accent }}
      title={`${hoursPerWeek} hrs/week estimated`}
    >
      {/* 4-bar meter */}
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-0.5 rounded-sm"
            style={{
              height: 8 + i * 1.5,
              background: i < filled ? accent : "var(--color-border-strong)",
              boxShadow:
                i < filled ? "0 0 6px color-mix(in oklch, currentColor 50%, transparent)" : "none",
            }}
          />
        ))}
      </span>
      <span>{LABEL[level]}</span>
      <span className="mono tnum" style={{ color: "var(--color-text-muted)" }}>
        {hoursPerWeek}h
      </span>
    </span>
  );
}
