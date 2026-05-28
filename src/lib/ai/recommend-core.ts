/**
 * Pure scoring core for smart course recommendations.
 *
 * Deliberately separated from `recommend.ts` (which does DB + LLM calls) so this
 * module can be unit-tested without mocking infrastructure. Every function here
 * is deterministic given the same inputs.
 */

import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";

export interface UserSignals {
  /** Course codes the user has completed or transferred. */
  takenCodes: Set<string>;
  /** Course codes the user already has planned/enrolled (excluded from recs). */
  excludeCodes: Set<string>;
  /** Free-text interests from the profile. Used for the interest-similarity score. */
  interests: string[];
  /** Optional program track to bias selection (AI, Web Services, etc.). */
  program?: string;
}

export interface ScoredCandidate {
  course: CourseCatalogEntry;
  prereqDistance: number;
  /** 0-1 cosine similarity between interest text and course description. */
  interestScore: number;
  /** Final blended score (higher = better). */
  totalScore: number;
  /** Why we surfaced it — for debugging + fallback rationale. */
  reasons: string[];
}

const MAX_PREREQ_DISTANCE = 2;
const AVAILABILITY_WEIGHT = 0.5;
const INTEREST_WEIGHT = 0.5;

/**
 * How many prereqs are still missing? Used to filter unreachable courses and
 * to score by "closeness to eligibility".
 *
 * - `all` prereqs: each one missing counts +1.
 * - `any` prereqs: counts +1 only if ZERO of the alternatives are satisfied.
 * - `concurrent`: ignored — those can be taken same-term so they don't gate the rec.
 */
export function prereqDistance(course: CourseCatalogEntry, takenCodes: Set<string>): number {
  const pre = course.prereqs;
  if (!pre) return 0;
  let missing = 0;

  for (const code of pre.all ?? []) {
    if (!takenCodes.has(code)) missing += 1;
  }

  const anyList = pre.any ?? [];
  if (anyList.length > 0) {
    const satisfied = anyList.some((c) => takenCodes.has(c));
    if (!satisfied) missing += 1;
  }

  return missing;
}

/** Cosine similarity for already-normalized vectors (sentence-transformers). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  // Clamp; floats can drift slightly outside [-1, 1].
  return Math.max(-1, Math.min(1, sum));
}

/** Convert prereq distance to a 0-1 availability score. 0 missing = 1.0; 2 missing = 0.4. */
export function availabilityScore(distance: number): number {
  if (distance < 0) return 0;
  return Math.max(0, 1 - distance * 0.3);
}

/**
 * Compute a single course's score given (catalog entry, prereq distance,
 * interest similarity). Returns a blended 0-1 score + the reason list.
 */
export function scoreCandidate(
  course: CourseCatalogEntry,
  distance: number,
  interestScore: number,
): ScoredCandidate {
  const avail = availabilityScore(distance);
  const total = AVAILABILITY_WEIGHT * avail + INTEREST_WEIGHT * Math.max(0, interestScore);

  const reasons: string[] = [];
  if (distance === 0) reasons.push("All prereqs satisfied");
  else if (distance === 1) reasons.push("1 prereq away");
  else if (distance > 1) reasons.push(`${distance} prereqs away`);

  if (interestScore > 0.5)
    reasons.push(`Strong interest match (${(interestScore * 100).toFixed(0)}%)`);
  else if (interestScore > 0.3)
    reasons.push(`Decent interest match (${(interestScore * 100).toFixed(0)}%)`);

  return {
    course,
    prereqDistance: distance,
    interestScore,
    totalScore: total,
    reasons,
  };
}

/**
 * Filter the full catalog down to eligible candidates the LLM can pick from.
 * Excludes:
 *   - courses already in the user's plan (taken or planned)
 *   - courses with prereqDistance > MAX_PREREQ_DISTANCE
 *   - deficiency courses unless explicitly requested (they're not real "recommendations")
 */
export interface FilterOptions {
  signals: UserSignals;
  catalog: CourseCatalogEntry[];
  categoryFilter?: ReadonlyArray<NonNullable<CourseCatalogEntry["category"]>>;
  includeDeficiencies?: boolean;
}

export function filterCandidates(opts: FilterOptions): CourseCatalogEntry[] {
  const out: CourseCatalogEntry[] = [];
  for (const c of opts.catalog) {
    if (opts.signals.excludeCodes.has(c.code)) continue;
    if (opts.signals.takenCodes.has(c.code)) continue;
    if (!opts.includeDeficiencies && c.category === "deficiency") continue;
    if (opts.categoryFilter && opts.categoryFilter.length > 0) {
      if (
        !c.category ||
        !opts.categoryFilter.includes(c.category as NonNullable<CourseCatalogEntry["category"]>)
      ) {
        continue;
      }
    }
    const dist = prereqDistance(c, opts.signals.takenCodes);
    if (dist > MAX_PREREQ_DISTANCE) continue;
    out.push(c);
  }
  return out;
}

/**
 * Rank candidates by their blended score. Top N stable-sorted descending.
 * Returns a list of ScoredCandidate so callers can serialize / inspect.
 *
 * `getInterestScore(course)` is injected so this function stays pure — the
 * actual similarity is computed by the caller (which has access to the
 * embedding pipeline).
 */
export function rankCandidates(
  candidates: CourseCatalogEntry[],
  takenCodes: Set<string>,
  getInterestScore: (course: CourseCatalogEntry) => number,
  limit: number,
): ScoredCandidate[] {
  const scored = candidates.map((c) => {
    const distance = prereqDistance(c, takenCodes);
    const interestScore = getInterestScore(c);
    return scoreCandidate(c, distance, interestScore);
  });

  // Stable descending sort: higher totalScore wins; ties broken by lower
  // distance, then by alphabetical code for determinism.
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.prereqDistance !== b.prereqDistance) return a.prereqDistance - b.prereqDistance;
    return a.course.code.localeCompare(b.course.code);
  });

  return scored.slice(0, limit);
}

/**
 * Validate that LLM-returned recommendations actually exist in our candidate pool.
 * The LLM can occasionally hallucinate course codes — we never trust its output
 * blindly. Returns only the picks whose `code` matches a candidate.
 */
export function filterLLMHallucinations<T extends { code: string }>(
  llmPicks: T[],
  validCodes: Set<string>,
): T[] {
  return llmPicks.filter((p) => validCodes.has(p.code));
}

/**
 * Build the user signals snapshot from a plan + interest array.
 * Pulled into its own function so tests can construct it without DB calls.
 */
export function buildSignals(
  userPlan: PlannedCourse[],
  interests: string[],
  program?: string,
): UserSignals {
  const takenCodes = new Set<string>();
  const excludeCodes = new Set<string>();
  for (const p of userPlan) {
    if (p.status === "transferred" || p.status === "completed") {
      takenCodes.add(p.courseCode);
      excludeCodes.add(p.courseCode);
    } else if (p.status === "enrolled" || p.status === "planned") {
      excludeCodes.add(p.courseCode);
    }
    // dropped / disc / failed: don't add to either set.
  }
  return { takenCodes, excludeCodes, interests, program };
}

/** Constants exported for tests to assert on. */
export const SCORING = {
  MAX_PREREQ_DISTANCE,
  AVAILABILITY_WEIGHT,
  INTEREST_WEIGHT,
} as const;
