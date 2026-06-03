"use client";

import { CourseCard } from "@/components/planner/course-card";
import { WorkloadBadge } from "@/components/planner/workload-badge";
import { calculateTermWorkload } from "@/lib/domain/workload";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { Plus } from "lucide-react";

interface TermColumnProps {
  term: string;
  courses: PlannedCourse[];
  catalog: Map<string, CourseCatalogEntry>;
  violationsByCourse: Set<string>;
}

export function TermColumn({
  term,
  courses,
  catalog,
  violationsByCourse,
}: TermColumnProps): React.ReactElement {
  const workload = calculateTermWorkload(courses, catalog);
  const credits = workload.credits;
  const isFullTime = credits >= 12;

  return (
    <section
      className="flex w-[280px] shrink-0 flex-col gap-2 rounded-lg border p-3"
      style={{
        background: "var(--color-surface-2)",
        borderColor: "var(--color-border)",
      }}
      aria-label={`${term} courses`}
    >
      <header
        className="flex flex-col gap-2 pb-2 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{term}</h3>
          <span
            className="mono tnum text-xs"
            style={{ color: "var(--color-text-muted)" }}
            title={isFullTime ? "Full-time load" : "Below full-time (12 cr)"}
          >
            {credits} cr
            {isFullTime && (
              <span className="ml-1" style={{ color: "var(--color-success)" }}>
                ●
              </span>
            )}
          </span>
        </div>
        {workload.courseCount > 0 && (
          <WorkloadBadge level={workload.level} hoursPerWeek={workload.hoursPerWeek} />
        )}
      </header>

      <div className="flex flex-col gap-2 min-h-[80px]">
        {courses.length === 0 ? (
          <div
            className="rounded-md border border-dashed py-6 text-center text-xs"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            No courses
          </div>
        ) : (
          courses.map((c) => (
            <CourseCard
              key={`${c.courseCode}-${c.term}`}
              planned={c}
              course={catalog.get(c.courseCode)}
              hasViolation={violationsByCourse.has(c.courseCode)}
            />
          ))
        )}

        <button
          type="button"
          aria-label={`Add a course to ${term}`}
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs transition-colors hover:bg-accent/10 focus-visible:outline-none"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add course
        </button>
      </div>
    </section>
  );
}
