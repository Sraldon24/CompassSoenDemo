"use client";

import {
  addCourseToPlan,
  addTransferCredit,
  moveCourseToTerm,
  removeCourseFromPlan,
  setCourseStatus,
} from "@/app/(dashboard)/plan/actions";
import { CourseCard } from "@/components/planner/course-card";
import { CoursePicker } from "@/components/planner/course-picker";
import { WorkloadBadge } from "@/components/planner/workload-badge";
import { calculateTermWorkload } from "@/lib/domain/workload";
import type { CourseCatalogEntry, PlannedCourse, ValidationIssue } from "@/lib/validation/plan";
import { buildPlan, validatePlan } from "@/lib/validation/plan";
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
import { ArrowRightLeft, Plus, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  // Single source of truth for rendering. Seeded from the server snapshot;
  // mutated optimistically on add/move/remove, then reconciled by the server
  // action's revalidatePath (which re-renders this client with fresh props).
  const [courses, setCourses] = useState<PlannerCourse[]>(initialCourses);
  const [pickerTerm, setPickerTerm] = useState<string | null>(null);
  // When true, the course picker adds a transferred credit instead of a termed course.
  const [transferPickerOpen, setTransferPickerOpen] = useState(false);
  // First non-transfer term — used as the destination when moving a transfer back.
  const firstTerm = visibleTerms[0] ?? "Fall 2026";

  // Keep local state in sync when the server snapshot changes (after revalidate).
  useEffect(() => {
    setCourses(initialCourses);
  }, [initialCourses]);

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

  // Transferred (CEGEP) credits have no Concordia term — they live in their own
  // lane above the term board rather than in a Fall/Winter column.
  const transferredCourses = useMemo(
    () => courses.filter((c) => c.status === "transferred"),
    [courses],
  );

  const byTerm = useMemo(() => {
    const m = new Map<string, PlannerCourse[]>();
    for (const c of courses) {
      if (c.status === "transferred") continue; // shown in the Transfer lane
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

    const prev = courses;
    setCourses((cs) => cs.map((c) => (c.id === movedId ? { ...c, term: toTerm } : c)));
    startTransition(async () => {
      const result = await moveCourseToTerm({ userCourseId: movedId, toTerm });
      if (!result.success) {
        setCourses(prev); // roll back
        toast.error(`Couldn't move: ${result.error}`);
      } else {
        toast.success(`Moved to ${toTerm}`);
      }
    });
  };

  const handleAddCourse = (term: string, courseCode: string) => {
    setPickerTerm(null);
    const entry = catalog.get(courseCode);
    // Optimistic temp row (real id arrives via revalidate).
    const tempId = `temp-${courseCode}-${term}`;
    setCourses((cs) => [
      ...cs,
      { id: tempId, courseCode, term, status: "planned", isDeficiency: entry?.isDeficiency },
    ]);
    startTransition(async () => {
      const result = await addCourseToPlan({ courseCode, term });
      if (!result.success) {
        setCourses((cs) => cs.filter((c) => c.id !== tempId)); // roll back
        toast.error(result.error);
      } else {
        // Swap the temp id for the real DB id.
        setCourses((cs) => cs.map((c) => (c.id === tempId ? { ...c, id: result.data.id } : c)));
        toast.success(`Added ${courseCode} to ${term}`);
      }
    });
  };

  const handleRemoveCourse = (userCourseId: string) => {
    const prev = courses;
    setCourses((cs) => cs.filter((c) => c.id !== userCourseId));
    startTransition(async () => {
      const result = await removeCourseFromPlan({ userCourseId });
      if (!result.success) {
        setCourses(prev); // roll back
        toast.error(result.error);
      } else {
        toast.success("Removed from plan");
      }
    });
  };

  // Mark a termed course as a transferred credit, or move a transfer back into a term.
  const handleSetTransfer = (userCourseId: string, toTransfer: boolean) => {
    const prev = courses;
    const term = toTransfer ? "" : firstTerm;
    setCourses((cs) =>
      cs.map((c) =>
        c.id === userCourseId ? { ...c, status: toTransfer ? "transferred" : "planned", term } : c,
      ),
    );
    startTransition(async () => {
      const result = await setCourseStatus({
        userCourseId,
        status: toTransfer ? "transferred" : "planned",
        term: toTransfer ? undefined : firstTerm,
      });
      if (!result.success) {
        setCourses(prev);
        toast.error(result.error);
      } else {
        toast.success(toTransfer ? "Marked as transfer credit" : `Moved to ${firstTerm}`);
      }
    });
  };

  const handleAddTransfer = (courseCode: string) => {
    setTransferPickerOpen(false);
    const tempId = `temp-transfer-${courseCode}`;
    setCourses((cs) => [...cs, { id: tempId, courseCode, term: "", status: "transferred" }]);
    startTransition(async () => {
      const result = await addTransferCredit({ courseCode });
      if (!result.success) {
        setCourses((cs) => cs.filter((c) => c.id !== tempId));
        toast.error(result.error);
      } else {
        setCourses((cs) => cs.map((c) => (c.id === tempId ? { ...c, id: result.data.id } : c)));
        toast.success(`Added ${courseCode} as transfer credit`);
      }
    });
  };

  const plannedCodes = useMemo(() => new Set(courses.map((c) => c.courseCode)), [courses]);
  const activeCourse = activeId ? courses.find((c) => c.id === activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <TransferLane
        courses={transferredCourses}
        catalog={catalog}
        onRemove={handleRemoveCourse}
        onAddClick={() => setTransferPickerOpen(true)}
        onMoveBack={(id) => handleSetTransfer(id, false)}
        moveBackTerm={firstTerm}
      />

      <div className="flex gap-3 overflow-x-auto scroll-slim pb-4 -mx-4 px-4 md:-mx-8 md:px-8 stagger">
        {renderTerms.map((term, index) => (
          <DroppableTerm
            key={term}
            term={term}
            index={index}
            courses={byTerm.get(term) ?? []}
            catalog={catalog}
            violationsByCourse={violationCodes}
            onAddClick={() => setPickerTerm(term)}
            onRemove={handleRemoveCourse}
            onMarkTransfer={(id) => handleSetTransfer(id, true)}
          />
        ))}
      </div>

      {pickerTerm && (
        <CoursePicker
          term={pickerTerm}
          catalog={catalogList}
          excludeCodes={plannedCodes}
          onPick={(code) => handleAddCourse(pickerTerm, code)}
          onClose={() => setPickerTerm(null)}
        />
      )}

      {transferPickerOpen && (
        <CoursePicker
          term="Transfer credits"
          catalog={catalogList}
          excludeCodes={plannedCodes}
          onPick={(code) => handleAddTransfer(code)}
          onClose={() => setTransferPickerOpen(false)}
        />
      )}

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

interface TransferLaneProps {
  courses: PlannerCourse[];
  catalog: Map<string, CourseCatalogEntry>;
  onRemove: (userCourseId: string) => void;
  onAddClick: () => void;
  onMoveBack: (userCourseId: string) => void;
  moveBackTerm: string;
}

/**
 * Non-term lane for transferred / CEGEP credits (e.g. MATH 204 from CEGEP).
 * These satisfy requirements but weren't taken in a Concordia term, so they
 * don't belong in a Fall/Winter column. Always rendered (even when empty) so
 * the user can add a transfer credit by hand.
 */
function TransferLane({
  courses,
  catalog,
  onRemove,
  onAddClick,
  onMoveBack,
  moveBackTerm,
}: TransferLaneProps): React.ReactElement {
  const credits = courses.reduce((sum, c) => sum + (catalog.get(c.courseCode)?.credits ?? 0), 0);
  return (
    <section
      className="animate-rise rounded-2xl ring-hairline shadow-[var(--shadow-sm)] p-4 mb-1"
      style={{ background: "var(--gradient-surface)" }}
      aria-label="Transferred credits"
    >
      <header className="flex items-baseline justify-between gap-2 pb-3">
        <h3 className="text-sm font-semibold tracking-[-0.01em]">Transfer credits</h3>
        <span className="mono tnum text-xs" style={{ color: "var(--color-text-muted)" }}>
          {credits} cr · CEGEP / transferred
        </span>
      </header>
      <div className="flex flex-wrap items-stretch gap-2">
        {courses.map((c) => (
          <div key={c.id} className="group relative w-[220px]">
            <CourseCard planned={c} course={catalog.get(c.courseCode)} hasViolation={false} />
            <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex focus-within:flex">
              <button
                type="button"
                aria-label={`Move ${c.courseCode} back to ${moveBackTerm}`}
                title={`Move back to ${moveBackTerm}`}
                onClick={() => onMoveBack(c.id)}
                className="h-6 w-6 items-center justify-center rounded-lg ring-hairline text-xs transition-colors flex hover:bg-[var(--color-accent-soft)] focus-visible:outline-none"
                style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${c.courseCode} from plan`}
                title="Remove course"
                onClick={() => onRemove(c.id)}
                className="h-6 w-6 items-center justify-center rounded-lg ring-hairline text-xs transition-colors flex hover:bg-[var(--color-danger-soft)] focus-visible:outline-none"
                style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddClick}
          aria-label="Add a transfer credit"
          className="pressable flex w-[220px] items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] focus-visible:outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add transfer credit
        </button>
      </div>
      {courses.length === 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
          CEGEP / advanced-standing credits (e.g. MATH 204). Add them here, or hover a course in a
          term and click ⇄ to move it here.
        </p>
      )}
    </section>
  );
}

interface DroppableTermProps {
  term: string;
  index: number;
  courses: PlannerCourse[];
  catalog: Map<string, CourseCatalogEntry>;
  violationsByCourse: Set<string>;
  onAddClick: () => void;
  onRemove: (userCourseId: string) => void;
  onMarkTransfer: (userCourseId: string) => void;
}

function DroppableTerm({
  term,
  index,
  courses,
  catalog,
  violationsByCourse,
  onAddClick,
  onRemove,
  onMarkTransfer,
}: DroppableTermProps): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: term });
  const workload = calculateTermWorkload(courses, catalog);
  const credits = workload.credits;
  const isFullTime = credits >= 12;

  return (
    <section
      ref={setNodeRef}
      className="flex w-[280px] shrink-0 flex-col gap-2 rounded-2xl ring-hairline p-3.5 transition-all duration-200"
      style={{
        ["--i" as string]: index,
        background: isOver
          ? "color-mix(in oklch, var(--color-accent-soft) 60%, var(--color-surface-2))"
          : "var(--gradient-surface)",
        boxShadow: isOver ? "var(--shadow-glow)" : "var(--shadow-sm)",
      }}
      aria-label={`${term} courses`}
    >
      <header
        className="flex flex-col gap-2 pb-2.5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-[-0.01em]">{term}</h3>
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
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center text-xs"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl ring-hairline"
              style={{ background: "var(--gradient-accent-soft)", color: "var(--color-accent)" }}
              aria-hidden
            >
              <Plus className="h-4 w-4" />
            </span>
            Drop a course here
          </div>
        ) : (
          courses.map((c) => (
            <DraggableCourse
              key={c.id}
              course={c}
              catalogEntry={catalog.get(c.courseCode)}
              hasViolation={violationsByCourse.has(c.courseCode)}
              onRemove={onRemove}
              onMarkTransfer={onMarkTransfer}
            />
          ))
        )}

        <button
          type="button"
          onClick={onAddClick}
          aria-label={`Add a course to ${term}`}
          className="pressable flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] focus-visible:outline-none"
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
  onRemove: (userCourseId: string) => void;
  onMarkTransfer: (userCourseId: string) => void;
}

function DraggableCourse({
  course,
  catalogEntry,
  hasViolation,
  onRemove,
  onMarkTransfer,
}: DraggableCourseProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: course.id });
  return (
    <div ref={setNodeRef} className="group relative" data-testid={`course-${course.courseCode}`}>
      {/* Drag handle wraps the card; the action buttons sit outside the listeners
          so a click acts rather than starting a drag. */}
      <div {...attributes} {...listeners}>
        <CourseCard
          planned={course}
          course={catalogEntry}
          hasViolation={hasViolation}
          dragging={isDragging}
        />
      </div>
      <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex focus-within:flex">
        <button
          type="button"
          aria-label={`Mark ${course.courseCode} as a transfer credit`}
          title="Move to transfer credits"
          onClick={(e) => {
            e.stopPropagation();
            onMarkTransfer(course.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-6 w-6 items-center justify-center rounded-lg ring-hairline text-xs transition-colors flex hover:bg-[var(--color-accent-soft)] focus-visible:outline-none"
          style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${course.courseCode} from plan`}
          title="Remove course"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(course.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-6 w-6 items-center justify-center rounded-lg ring-hairline text-xs transition-colors flex hover:bg-[var(--color-danger-soft)] focus-visible:outline-none"
          style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }): React.ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <section className="animate-rise space-y-2.5 mt-5">
      <p className="eyebrow">ISSUES ({issues.length})</p>
      <ul className="space-y-2 stagger">
        {issues.slice(0, 20).map((i, idx) => (
          <li
            key={`${i.rule}-${i.courseCode}-${i.term}-${idx}`}
            style={{ ["--i" as string]: idx, background: "var(--color-surface)" }}
            className="text-sm flex items-start gap-2.5 rounded-xl ring-hairline shadow-[var(--shadow-sm)] px-3.5 py-2.5"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mt-2 shrink-0"
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
