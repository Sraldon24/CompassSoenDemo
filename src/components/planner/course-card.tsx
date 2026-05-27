"use client";

import { cn } from "@/lib/utils";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { GripVertical } from "lucide-react";

interface CourseCardProps {
  planned: PlannedCourse;
  course: CourseCatalogEntry | undefined;
  hasViolation: boolean;
  dragging?: boolean;
}

const STATUS_STYLES: Record<PlannedCourse["status"], { dot: string; label: string }> = {
  planned: { dot: "var(--color-text-subtle)", label: "Planned" },
  enrolled: { dot: "var(--color-accent)", label: "Enrolled" },
  completed: { dot: "var(--color-success)", label: "Done" },
  transferred: { dot: "var(--color-success)", label: "Transferred" },
  dropped: { dot: "var(--color-text-muted)", label: "Dropped" },
  disc: { dot: "var(--color-warning)", label: "DISC" },
  failed: { dot: "var(--color-danger)", label: "Failed" },
};

export function CourseCard({
  planned,
  course,
  hasViolation,
  dragging = false,
}: CourseCardProps): React.ReactElement {
  const statusStyle = STATUS_STYLES[planned.status];
  return (
    <div
      data-violation={hasViolation || undefined}
      data-status={planned.status}
      className={cn(
        "group relative flex items-start gap-2 rounded-md border bg-surface p-2.5 transition-colors",
        dragging && "opacity-40",
      )}
      style={{
        background: "var(--color-surface)",
        borderColor: hasViolation
          ? "color-mix(in oklch, var(--color-danger) 40%, var(--color-border))"
          : "var(--color-border)",
        boxShadow: hasViolation ? "inset 3px 0 0 var(--color-danger)" : "inset 3px 0 0 transparent",
      }}
    >
      <button
        type="button"
        aria-label="Drag handle"
        className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity touch-none focus-visible:opacity-100"
        style={{ color: "var(--color-text-subtle)" }}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 justify-between">
          <span className="mono tnum text-sm font-semibold">{planned.courseCode}</span>
          <span className="text-[10px] mono tnum" style={{ color: "var(--color-text-muted)" }}>
            {course?.credits ?? "?"} cr
          </span>
        </div>
        <div
          className="text-xs leading-snug mt-0.5 line-clamp-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          {course?.title ?? "Course not in catalog"}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: statusStyle.dot }}
            aria-hidden
          />
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            {statusStyle.label}
          </span>
        </div>
      </div>
    </div>
  );
}
