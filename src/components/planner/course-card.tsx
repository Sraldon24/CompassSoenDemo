"use client";

import { CourseCode } from "@/components/ui/course-code";
import { cn } from "@/lib/utils";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { Check, GripVertical } from "lucide-react";

interface CourseCardProps {
  planned: PlannedCourse;
  course: CourseCatalogEntry | undefined;
  hasViolation: boolean;
  dragging?: boolean;
}

export function CourseCard({
  planned,
  course,
  hasViolation,
  dragging = false,
}: CourseCardProps): React.ReactElement {
  const isDone = planned.status === "completed" || planned.status === "transferred";
  const isEnrolled = planned.status === "enrolled";

  // Border + shadow follow the Meridian print language: enrolled cards get the
  // Clementine accent border + offset hard-shadow + accent dot; violations turn
  // the border red; everything else is a plain ink hairline.
  const borderColor = hasViolation
    ? "color-mix(in oklch, var(--bad) 55%, var(--line))"
    : isEnrolled
      ? "color-mix(in oklch, var(--accent) 55%, transparent)"
      : "var(--line)";

  return (
    <div
      data-violation={hasViolation || undefined}
      data-status={planned.status}
      className={cn(
        "group relative rounded-[var(--r-md)] px-[11px] py-2.5 transition-all duration-150",
        "border-[1.5px] hover:translate-x-0.5",
        dragging && "rotate-2 cursor-grabbing opacity-50",
      )}
      style={{
        background: "var(--surface)",
        borderColor,
        boxShadow: isEnrolled ? "var(--hard-shadow)" : "none",
        opacity: isDone ? 0.62 : 1,
      }}
    >
      <div className="flex items-center gap-[7px]">
        {isDone ? (
          <span className="flex" style={{ color: "var(--ok)" }} aria-hidden>
            <Check className="h-[15px] w-[15px]" />
          </span>
        ) : (
          <button
            type="button"
            aria-label="Drag handle"
            className="-ml-[3px] flex cursor-grab touch-none transition-colors group-hover:text-[var(--ink-2)] focus-visible:opacity-100"
            style={{ color: "var(--ink-3)" }}
          >
            <GripVertical className="h-[15px] w-[15px]" />
          </button>
        )}
        <CourseCode code={planned.courseCode} className="text-[11.5px]" />
        <span className="mono ml-auto text-[11px]" style={{ color: "var(--ink-3)" }}>
          {course?.credits ?? "?"}cr
        </span>
      </div>
      <div
        className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-[1.25]"
        style={{ color: "var(--ink)" }}
      >
        {course?.title ?? "Course not in catalog"}
      </div>
      {isEnrolled && (
        <span
          className="absolute right-[9px] top-2 block h-[7px] w-[7px] rounded-full"
          style={{ background: "var(--accent)" }}
          aria-hidden
        />
      )}
    </div>
  );
}
