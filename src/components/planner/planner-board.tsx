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
import { Badge } from "@/components/ui/badge";
import { CourseCode } from "@/components/ui/course-code";
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
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronDown,
  GripVertical,
  Plus,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
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

  // Total credits mapped across every planned/enrolled/completed/transferred row.
  const totalMapped = useMemo(
    () => courses.reduce((sum, c) => sum + (catalog.get(c.courseCode)?.credits ?? 0), 0),
    [courses, catalog],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Toolbar: hint chips + the live credit tally. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="gap-1.5">
          <GripVertical className="h-3 w-3" />
          Drag cards between terms
        </Badge>
        <Badge variant="secondary">
          <span className="mono tnum">{totalMapped}</span> cr mapped of 120
        </Badge>
      </div>

      <IssueList issues={issues} />

      <TransferLane
        courses={transferredCourses}
        catalog={catalog}
        onRemove={handleRemoveCourse}
        onAddClick={() => setTransferPickerOpen(true)}
        onMoveBack={(id) => handleSetTransfer(id, false)}
        moveBackTerm={firstTerm}
      />

      <div className="scroll flex gap-3.5 overflow-x-auto overflow-y-hidden pb-2.5 -mx-4 px-4 md:-mx-8 md:px-8 stagger">
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
      className="card-hard animate-rise mb-4 p-4"
      style={{ borderColor: "var(--line-strong)" }}
      aria-label="Transferred credits"
    >
      <header className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Transfer credits</span>
          <Badge variant="secondary">
            <span className="mono tnum">{credits}</span> cr · CEGEP / transferred
          </Badge>
        </div>
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
                className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] border-[1.5px] text-xs transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-none"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--line-strong)",
                  color: "var(--ink-3)",
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${c.courseCode} from plan`}
                title="Remove course"
                onClick={() => onRemove(c.id)}
                className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] border-[1.5px] text-xs transition-colors hover:bg-[var(--bad-soft)] focus-visible:outline-none"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--line-strong)",
                  color: "var(--ink-3)",
                }}
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
          className="flex w-[220px] items-center justify-center gap-1.5 rounded-[var(--r-md)] border-[1.5px] border-dashed py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-[var(--surface-2)] hover:border-[var(--ink)] focus-visible:outline-none"
          style={{ borderColor: "var(--line-strong)", color: "var(--ink-3)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add transfer credit
        </button>
      </div>
      {courses.length === 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
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
  // The first visible term is "now"; a term is "Done" once every course in it
  // has been completed.
  const isCurrent = index === 0;
  const allDone = courses.length > 0 && courses.every((c) => c.status === "completed");

  return (
    <section
      ref={setNodeRef}
      className="flex w-[252px] shrink-0 flex-col"
      style={{ ["--i" as string]: index }}
      aria-label={`${term} courses`}
    >
      {/* Ink header — Bricolage term name, status Badge, credits + workload. */}
      <header
        className="flex flex-col gap-2 rounded-t-[var(--r-md)] border-[1.5px] border-b-0 px-[13px] py-3"
        style={{
          borderColor: "var(--line-strong)",
          background: isCurrent ? "var(--accent-soft)" : "var(--paper-2)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            className="text-[14.5px] font-bold tracking-[-0.01em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {term}
          </h3>
          {isCurrent ? (
            <Badge variant="accent">Current</Badge>
          ) : allDone ? (
            <Badge variant="success" className="gap-1">
              <Check className="h-3 w-3" />
              Done
            </Badge>
          ) : (
            <span className="mono tnum text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {courses.length} crs
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="mono tnum text-[12.5px] font-bold">{credits} cr</span>
          {workload.courseCount > 0 && !allDone && (
            <WorkloadBadge level={workload.level} hoursPerWeek={workload.hoursPerWeek} />
          )}
        </div>
      </header>

      {/* Body — surface-2 drop area; accent-soft + dashed outline while dragging. */}
      <div
        className="scroll flex flex-1 flex-col gap-2 rounded-b-[var(--r-md)] border-[1.5px] border-t-0 p-2 transition-all duration-150"
        style={{
          borderColor: "var(--line-strong)",
          background: isOver ? "var(--accent-soft)" : "var(--surface-2)",
          outline: isOver ? "2px dashed var(--accent)" : "none",
          outlineOffset: -4,
        }}
      >
        {courses.length === 0 ? (
          <div
            className="grid min-h-[80px] flex-1 place-items-center rounded-[var(--r-md)] border-[1.5px] border-dashed text-center text-[12.5px] leading-tight"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink-3)" }}
          >
            Drop a course
            <br />
            here
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
          className="flex items-center justify-center gap-1.5 rounded-[var(--r-md)] border-[1.5px] border-dashed py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-[var(--surface)] hover:border-[var(--ink)] focus-visible:outline-none"
          style={{
            borderColor: "var(--line-strong)",
            color: "var(--ink-3)",
          }}
        >
          <Plus className="h-[15px] w-[15px]" />
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
          className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] border-[1.5px] text-xs transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-none"
          style={{
            background: "var(--surface)",
            borderColor: "var(--line-strong)",
            color: "var(--ink-3)",
          }}
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
          className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] border-[1.5px] text-xs transition-colors hover:bg-[var(--bad-soft)] focus-visible:outline-none"
          style={{
            background: "var(--surface)",
            borderColor: "var(--line-strong)",
            color: "var(--ink-3)",
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Maps a validation severity onto the Meridian colour pair (dot + Badge variant). */
const SEVERITY_DOT: Record<ValidationIssue["severity"], string> = {
  error: "var(--bad)",
  warning: "color-mix(in oklch, var(--warn) 80%, var(--ink))",
  info: "var(--info)",
};
const SEVERITY_BADGE: Record<ValidationIssue["severity"], "destructive" | "warning" | "info"> = {
  error: "destructive",
  warning: "warning",
  info: "info",
};

function IssueList({ issues }: { issues: ValidationIssue[] }): React.ReactElement | null {
  const [open, setOpen] = useState(true);
  if (issues.length === 0) return null;
  return (
    <div
      className="card animate-rise mb-4 overflow-hidden"
      style={{ borderColor: "var(--line-strong)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-[11px] px-4 py-[13px] text-left"
        style={{
          background: "var(--surface-2)",
          borderBottom: open ? "1.5px solid var(--line)" : "none",
        }}
      >
        <span
          className="grid h-[26px] w-[26px] place-items-center rounded-[7px]"
          style={{
            background: "var(--warn-soft)",
            color: "color-mix(in oklch, var(--warn) 78%, var(--ink))",
          }}
          aria-hidden
        >
          <TriangleAlert className="h-4 w-4" />
        </span>
        <span className="text-[14.5px] font-bold">Plan validation</span>
        <Badge variant="warning">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </Badge>
        <span
          className="ml-auto flex transition-transform duration-200"
          style={{ color: "var(--ink-3)", transform: open ? "none" : "rotate(-90deg)" }}
          aria-hidden
        >
          <ChevronDown className="h-[18px] w-[18px]" />
        </span>
      </button>
      {open && (
        <div
          className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3"
          style={{ background: "var(--line)" }}
        >
          {issues.slice(0, 20).map((i, idx) => (
            <div
              key={`${i.rule}-${i.courseCode}-${i.term}-${idx}`}
              className="flex flex-col gap-[7px] px-4 py-3.5"
              style={{ background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: SEVERITY_DOT[i.severity] }}
                  aria-hidden
                />
                <span className="text-[13.5px] font-bold">{i.rule.replace(/_/g, " ")}</span>
                <Badge variant={SEVERITY_BADGE[i.severity]} className="ml-auto">
                  {i.term}
                </Badge>
              </div>
              <p className="text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                {i.message}
              </p>
              {i.suggestion && (
                <p className="text-[12px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
                  Suggestion: {i.suggestion}
                </p>
              )}
              {i.courseCode && (
                <span className="flex items-center gap-1.5 self-start">
                  <CourseCode code={i.courseCode} className="text-[11.5px]" />
                  <ArrowRight
                    className="h-[13px] w-[13px]"
                    style={{ color: "var(--accent-deep)" }}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
