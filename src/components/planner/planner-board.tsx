"use client";

import { moveCourseToTerm } from "@/app/(dashboard)/plan/actions";
import { CourseCard } from "@/components/planner/course-card";
import { WorkloadBadge } from "@/components/planner/workload-badge";
import type { CourseCatalogEntry, PlannedCourse, ValidationIssue } from "@/lib/validation/plan";
import { buildPlan, validatePlan } from "@/lib/validation/plan";
import { calculateTermWorkload } from "@/lib/workload";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

/** UserCourse row with id (DB primary key) for DnD identity. */
export interface PlannerCourse extends PlannedCourse {
  id: string;
}

interface PlannerBoardProps {
  initialCourses: PlannerCourse[];
  catalogList: CourseCatalogEntry[];
  visibleTerms: string[];
}

export function PlannerBoard({
  initialCourses,
  catalogList,
  visibleTerms,
}: PlannerBoardProps): React.ReactElement {
  const catalog = useMemo(() => {
    const m = new Map<string, CourseCatalogEntry>();
    for (const c of catalogList) m.set(c.code, c);
    return m;
  }, [catalogList]);

  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [courses, applyOptimistic] = useOptimistic<PlannerCourse[], { id: string; toTerm: string }>(
    initialCourses,
    (state, action) => state.map((c) => (c.id === action.id ? { ...c, term: action.toTerm } : c)),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  // Derive issues + violation set from the optimistic state.
  const plan = useMemo(() => buildPlan(courses, catalogList), [courses, catalogList]);
  const issues: ValidationIssue[] = useMemo(() => validatePlan(plan), [plan]);
  const violationCodes = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) if (i.severity === "error" && i.courseCode) set.add(i.courseCode);
    return set;
  }, [issues]);

  const byTerm = useMemo(() => {
    const m = new Map<string, PlannerCourse[]>();
    for (const c of courses) {
      if (!m.has(c.term)) m.set(c.term, []);
      m.get(c.term)?.push(c);
    }
    return m;
  }, [courses]);

  // Hide empty Summer terms by default to keep things scannable.
  const renderTerms = useMemo(
    () =>
      visibleTerms.filter((t) =>
        t.startsWith("Summer") ? (byTerm.get(t)?.length ?? 0) > 0 : true,
      ),
    [visibleTerms, byTerm],
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const movedId = String(active.id);
    const toTerm = String(over.id);
    const current = courses.find((c) => c.id === movedId);
    if (!current || current.term === toTerm) return;

    startTransition(async () => {
      applyOptimistic({ id: movedId, toTerm });
      const result = await moveCourseToTerm({ userCourseId: movedId, toTerm });
      if (!result.success) {
        toast.error(`Couldn't move: ${result.error}`);
      } else {
        toast.success(`Moved to ${toTerm}`);
      }
    });
  };

  const activeCourse = activeId ? courses.find((c) => c.id === activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-8 md:px-8">
        {renderTerms.map((term) => (
          <DroppableTerm
            key={term}
            term={term}
            courses={byTerm.get(term) ?? []}
            catalog={catalog}
            violationsByCourse={violationCodes}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCourse && (
          <CourseCard
            planned={activeCourse}
            course={catalog.get(activeCourse.courseCode)}
            hasViolation={violationCodes.has(activeCourse.courseCode)}
          />
        )}
      </DragOverlay>

      <IssueList issues={issues} />

      {/* Tiny status indicator for transitions. */}
      <span className="sr-only" aria-live="polite">
        {isPending ? "Saving…" : "Up to date"}
      </span>
    </DndContext>
  );
}

interface DroppableTermProps {
  term: string;
  courses: PlannerCourse[];
  catalog: Map<string, CourseCatalogEntry>;
  violationsByCourse: Set<string>;
}

function DroppableTerm({
  term,
  courses,
  catalog,
  violationsByCourse,
}: DroppableTermProps): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: term });
  const workload = calculateTermWorkload(courses, catalog);
  const credits = workload.credits;
  const isFullTime = credits >= 12;

  return (
    <section
      ref={setNodeRef}
      className="flex w-[280px] shrink-0 flex-col gap-2 rounded-lg border p-3 transition-colors"
      style={{
        background: isOver
          ? "color-mix(in oklch, var(--color-accent-soft) 60%, var(--color-surface-2))"
          : "var(--color-surface-2)",
        borderColor: isOver ? "var(--color-accent)" : "var(--color-border)",
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
            Drop a course here
          </div>
        ) : (
          courses.map((c) => (
            <DraggableCourse
              key={c.id}
              course={c}
              catalogEntry={catalog.get(c.courseCode)}
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

interface DraggableCourseProps {
  course: PlannerCourse;
  catalogEntry: CourseCatalogEntry | undefined;
  hasViolation: boolean;
}

function DraggableCourse({
  course,
  catalogEntry,
  hasViolation,
}: DraggableCourseProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: course.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`course-${course.courseCode}`}
    >
      <CourseCard
        planned={course}
        course={catalogEntry}
        hasViolation={hasViolation}
        dragging={isDragging}
      />
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }): React.ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <section className="space-y-2 mt-4">
      <h2
        className="text-sm font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        Issues ({issues.length})
      </h2>
      <ul className="space-y-1.5">
        {issues.slice(0, 20).map((i, idx) => (
          <li
            key={`${i.rule}-${i.courseCode}-${i.term}-${idx}`}
            className="text-sm flex items-start gap-2 rounded-md border px-3 py-2"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
              style={{
                background:
                  i.severity === "error"
                    ? "var(--color-danger)"
                    : i.severity === "warning"
                      ? "var(--color-warning)"
                      : "var(--color-text-muted)",
              }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                {i.courseCode && (
                  <span className="mono tnum text-xs font-semibold">{i.courseCode}</span>
                )}
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {i.term}
                </span>
              </div>
              <p>{i.message}</p>
              {i.suggestion && (
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Suggestion: {i.suggestion}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {issues.length > 20 && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          + {issues.length - 20} more issues
        </p>
      )}
    </section>
  );
}
