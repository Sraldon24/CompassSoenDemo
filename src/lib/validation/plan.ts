/**
 * Plan validation — pure rules engine.
 *
 * No LLM, no DB calls inside the validator. Caller assembles a `Plan` snapshot
 * (user's courses with terms + status + the course catalog) and passes it in.
 * Returns a structured list of issues that the UI renders as badges/tooltips.
 */

export type CourseStatus =
  | "planned"
  | "enrolled"
  | "completed"
  | "transferred"
  | "dropped"
  | "disc"
  | "failed";

export type TermSeason = "Fall" | "Winter" | "Summer";

export interface TermLabel {
  /** e.g. "Fall 2026" */
  raw: string;
  season: TermSeason;
  year: number;
}

export interface CourseCatalogEntry {
  code: string;
  title: string;
  credits: number;
  category?: string | null;
  prereqs?: {
    all?: string[];
    any?: string[];
    concurrent?: string[];
    notes?: string;
  };
  /** Term offerings — defaults: fall+winter true, summer false. */
  offeredFall?: boolean;
  offeredWinter?: boolean;
  offeredSummer?: boolean;
  isDeficiency?: boolean;
  /** Community-rated workload (used by the predictor when available). */
  avgHoursPerWeek?: number;
}

export interface PlannedCourse {
  courseCode: string;
  term: string;
  status: CourseStatus;
  isDeficiency?: boolean;
}

export interface Plan {
  courses: PlannedCourse[];
  catalog: Map<string, CourseCatalogEntry>;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  /** Course this issue applies to. */
  courseCode: string;
  term: string;
  severity: IssueSeverity;
  rule: ValidationRule;
  message: string;
  /** Optional suggested fix. */
  suggestion?: string;
}

export type ValidationRule =
  | "prereq_missing"
  | "prereq_wrong_order"
  | "coreq_missing"
  | "term_not_offered"
  | "credit_overload"
  | "credit_underload"
  | "duplicate_course";

const TERM_ORDER: Record<TermSeason, number> = { Winter: 0, Summer: 1, Fall: 2 };
const FULL_TIME_MIN = 12;
const HEAVY_LOAD_MAX = 18;

export function parseTermLabel(label: string): TermLabel | null {
  const m = label.match(/^(Fall|Winter|Summer)\s+(\d{4})$/i);
  if (!m || !m[1] || !m[2]) return null;
  const season = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return {
    raw: label,
    season: season as TermSeason,
    year: Number(m[2]),
  };
}

/** Total ordering across all terms — earlier returns smaller number. */
export function termOrdinal(label: TermLabel): number {
  return label.year * 10 + TERM_ORDER[label.season];
}

/** Does `prereq` finish strictly before `course` begins? */
function isBefore(prereqTerm: TermLabel, courseTerm: TermLabel): boolean {
  return termOrdinal(prereqTerm) < termOrdinal(courseTerm);
}

/** Same term as `courseTerm`? */
function isConcurrent(otherTerm: TermLabel, courseTerm: TermLabel): boolean {
  return termOrdinal(otherTerm) === termOrdinal(courseTerm);
}

function isSatisfiedBy(
  prereqCode: string,
  courseTerm: TermLabel,
  plan: Plan,
  options: { allowConcurrent?: boolean } = {},
): boolean {
  // A prereq is satisfied if completed/enrolled/transferred BEFORE this term
  // (or concurrent if allowConcurrent).
  for (const p of plan.courses) {
    if (p.courseCode !== prereqCode) continue;
    if (p.status === "dropped" || p.status === "disc" || p.status === "failed") {
      continue;
    }
    if (p.status === "transferred" || p.status === "completed") {
      return true; // transfer/completed assumed valid anytime.
    }
    const pTerm = parseTermLabel(p.term);
    if (!pTerm) continue;
    if (isBefore(pTerm, courseTerm)) return true;
    if (options.allowConcurrent && isConcurrent(pTerm, courseTerm)) return true;
  }
  return false;
}

function validateCoursePrereqs(planned: PlannedCourse, plan: Plan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const term = parseTermLabel(planned.term);
  if (!term) return issues;
  const entry = plan.catalog.get(planned.courseCode);
  if (!entry?.prereqs) return issues;

  const { all = [], any = [], concurrent = [] } = entry.prereqs;

  // ALL: every prereq must be satisfied (completed/transferred before).
  for (const prereqCode of all) {
    if (!isSatisfiedBy(prereqCode, term, plan)) {
      issues.push({
        courseCode: planned.courseCode,
        term: planned.term,
        severity: "error",
        rule: "prereq_missing",
        message: `${planned.courseCode} needs ${prereqCode} completed before ${planned.term}.`,
        suggestion: `Add ${prereqCode} to an earlier term, or move ${planned.courseCode} later.`,
      });
    }
  }

  // ANY: at least one of the alternatives must be satisfied.
  if (any.length > 0) {
    const anySatisfied = any.some((p) => isSatisfiedBy(p, term, plan));
    if (!anySatisfied) {
      issues.push({
        courseCode: planned.courseCode,
        term: planned.term,
        severity: "error",
        rule: "prereq_missing",
        message: `${planned.courseCode} needs one of ${any.join(", ")} completed before ${planned.term}.`,
      });
    }
  }

  // CONCURRENT: must be satisfied before OR in the same term.
  for (const coreqCode of concurrent) {
    if (!isSatisfiedBy(coreqCode, term, plan, { allowConcurrent: true })) {
      issues.push({
        courseCode: planned.courseCode,
        term: planned.term,
        severity: "warning",
        rule: "coreq_missing",
        message: `${planned.courseCode} expects ${coreqCode} done or taken concurrently.`,
        suggestion: `Add ${coreqCode} to ${planned.term} or earlier.`,
      });
    }
  }

  return issues;
}

function validateTermOffering(planned: PlannedCourse, plan: Plan): ValidationIssue | null {
  const entry = plan.catalog.get(planned.courseCode);
  if (!entry) return null;
  const term = parseTermLabel(planned.term);
  if (!term) return null;

  const offeredFall = entry.offeredFall ?? true;
  const offeredWinter = entry.offeredWinter ?? true;
  const offeredSummer = entry.offeredSummer ?? false;

  const offeredThisTerm =
    (term.season === "Fall" && offeredFall) ||
    (term.season === "Winter" && offeredWinter) ||
    (term.season === "Summer" && offeredSummer);

  if (!offeredThisTerm) {
    return {
      courseCode: planned.courseCode,
      term: planned.term,
      severity: "warning",
      rule: "term_not_offered",
      message: `${planned.courseCode} is not normally offered in ${term.season}.`,
    };
  }
  return null;
}

function validateTermLoad(
  termLabel: string,
  termCourses: PlannedCourse[],
  plan: Plan,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const term = parseTermLabel(termLabel);
  if (!term) return issues;
  if (term.season === "Summer") return issues; // Summer is intentionally part-time.

  let credits = 0;
  for (const c of termCourses) {
    if (c.status === "dropped" || c.status === "disc" || c.status === "failed") continue;
    const entry = plan.catalog.get(c.courseCode);
    credits += entry?.credits ?? 0;
  }

  if (credits === 0) return issues;
  if (credits > HEAVY_LOAD_MAX) {
    issues.push({
      courseCode: "",
      term: termLabel,
      severity: "warning",
      rule: "credit_overload",
      message: `${termLabel} is loaded with ${credits} credits — above the ${HEAVY_LOAD_MAX}-credit comfort line.`,
    });
  } else if (credits > 0 && credits < FULL_TIME_MIN) {
    issues.push({
      courseCode: "",
      term: termLabel,
      severity: "info",
      rule: "credit_underload",
      message: `${termLabel} has ${credits} credits — below full-time (${FULL_TIME_MIN}).`,
    });
  }
  return issues;
}

function validateDuplicates(plan: Plan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, PlannedCourse>();
  for (const p of plan.courses) {
    if (p.status === "dropped" || p.status === "disc" || p.status === "failed") continue;
    const prior = seen.get(p.courseCode);
    if (prior) {
      issues.push({
        courseCode: p.courseCode,
        term: p.term,
        severity: "warning",
        rule: "duplicate_course",
        message: `${p.courseCode} appears in both ${prior.term} and ${p.term}.`,
        suggestion: "Remove the duplicate, unless you're intentionally retaking.",
      });
    } else {
      seen.set(p.courseCode, p);
    }
  }
  return issues;
}

/**
 * Top-level validator. Returns ALL issues across the plan.
 * Caller filters/sorts by severity or term as needed.
 */
export function validatePlan(plan: Plan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Per-course checks.
  for (const p of plan.courses) {
    if (p.status === "dropped" || p.status === "disc" || p.status === "failed") continue;
    issues.push(...validateCoursePrereqs(p, plan));
    const offering = validateTermOffering(p, plan);
    if (offering) issues.push(offering);
  }

  // Per-term load checks.
  const byTerm = groupByTerm(plan.courses);
  for (const [termLabel, list] of byTerm.entries()) {
    issues.push(...validateTermLoad(termLabel, list, plan));
  }

  // Duplicate detection.
  issues.push(...validateDuplicates(plan));

  return issues;
}

export function groupByTerm(courses: PlannedCourse[]): Map<string, PlannedCourse[]> {
  const m = new Map<string, PlannedCourse[]>();
  for (const c of courses) {
    if (!m.has(c.term)) m.set(c.term, []);
    m.get(c.term)?.push(c);
  }
  return m;
}

/** Helper for tests + UI: build a `Plan` from raw arrays. */
export function buildPlan(courses: PlannedCourse[], catalogList: CourseCatalogEntry[]): Plan {
  const catalog = new Map<string, CourseCatalogEntry>();
  for (const c of catalogList) catalog.set(c.code, c);
  return { courses, catalog };
}
