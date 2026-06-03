/**
 * Smart course recommendation graph (LangGraph v1).
 *
 * State machine:
 *   START → loadSignals → filterEligible → rankCandidates → llmRationalize → sanitize → END
 *
 * Each node is a pure async function over the state object. The graph gives us:
 *   - observable per-step state (logged + persistable later via checkpointer)
 *   - clean separation between data fetching, scoring (pure), LLM call, and validation
 *   - easy fan-out later (e.g. branch into Reddit summarization in Phase 4)
 *
 * The pure scoring logic still lives in `recommend-core.ts` — this graph just
 * orchestrates it. Tests cover the core separately; an integration test exercises
 * the graph end-to-end.
 */

import { db } from "@/lib/db";
import { courses, profiles, userCourses } from "@/lib/db/schema";
import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { END, START, StateGraph } from "@langchain/langgraph";
import { eq, ne } from "drizzle-orm";
import { embedBatch } from "../embeddings";
import { RECOMMEND_SYSTEM } from "../prompts";
import { generateResponse } from "../provider";
import {
  buildSignals,
  cosineSimilarity,
  filterCandidates,
  filterLLMHallucinations,
  rankCandidates,
} from "../recommend-core";

const CANDIDATE_POOL = 12;
const RESULT_COUNT = 5;

type CategoryName = NonNullable<CourseCatalogEntry["category"]>;

// ---------- Graph state -----------------------------------------------------

export interface RecommendationOutput {
  code: string;
  title: string;
  credits: number;
  category: string | null;
  why: string;
  score: number;
  reasons: string[];
}

interface GraphState {
  /** Input — set when invoking. */
  userId: string;
  interests: string[];
  categoryFilter?: CategoryName[];

  /** Populated by `loadSignals`. */
  takenCodes?: Set<string>;
  excludeCodes?: Set<string>;
  program?: string;
  catalog?: CourseCatalogEntry[];

  /** Populated by `filterEligible`. */
  eligibleCandidates?: CourseCatalogEntry[];

  /** Populated by `rankCandidates`. */
  ranked?: Array<{
    course: CourseCatalogEntry;
    prereqDistance: number;
    interestScore: number;
    totalScore: number;
    reasons: string[];
  }>;
  interestText?: string;

  /** Populated by `llmRationalize`. */
  llmPicks?: Array<{ code: string; why: string }>;

  /** Final output — populated by `sanitize`. */
  recommendations?: RecommendationOutput[];
}

// ---------- Node implementations -------------------------------------------

async function loadSignalsNode(state: GraphState): Promise<Partial<GraphState>> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, state.userId))
    .limit(1);

  const planRows = await db
    .select({
      courseCode: userCourses.courseCode,
      term: userCourses.term,
      status: userCourses.status,
    })
    .from(userCourses)
    .where(eq(userCourses.userId, state.userId));

  const interests =
    state.interests.length > 0 ? state.interests : ((profile?.interests as string[] | null) ?? []);

  const signals = buildSignals(
    planRows.map((p) => ({
      courseCode: p.courseCode,
      term: p.term ?? "",
      status: p.status,
    })),
    interests,
    profile?.program ?? undefined,
  );

  const catalogRows = await db.select().from(courses).where(ne(courses.code, ""));
  const catalog: CourseCatalogEntry[] = catalogRows.map((r) => ({
    code: r.code,
    title: r.title,
    credits: r.credits,
    category: r.category ?? null,
    prereqs: r.prereqs as CourseCatalogEntry["prereqs"],
    offeredFall: r.offeredFall ?? true,
    offeredWinter: r.offeredWinter ?? true,
    offeredSummer: r.offeredSummer ?? false,
    avgHoursPerWeek: r.avgHoursPerWeek ?? undefined,
    // Description enriches both the candidate embedding (so ranking isn't
    // title-only → generic) and the LLM rationale payload below.
    description: r.description ?? null,
  }));

  return {
    takenCodes: signals.takenCodes,
    excludeCodes: signals.excludeCodes,
    program: signals.program,
    interests,
    catalog,
  };
}

async function filterEligibleNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.catalog || !state.takenCodes || !state.excludeCodes) {
    throw new Error("filterEligible called before signals were loaded");
  }
  const eligible = filterCandidates({
    signals: {
      takenCodes: state.takenCodes,
      excludeCodes: state.excludeCodes,
      interests: state.interests,
      program: state.program,
    },
    catalog: state.catalog,
    categoryFilter: state.categoryFilter,
  });
  return { eligibleCandidates: eligible };
}

async function rankCandidatesNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.eligibleCandidates || !state.takenCodes) {
    throw new Error("rankCandidates called before eligibility filter");
  }
  if (state.eligibleCandidates.length === 0) {
    return { ranked: [], interestText: "" };
  }

  const interestText =
    state.interests.length > 0 ? state.interests.join(", ") : "general software engineering";

  // Embed the interest vector + all candidate texts in ONE batch (was a serial
  // per-candidate await loop — the recommend critical path). embedBatch runs
  // them together; the local MiniLM model has no per-call network cost.
  const candidateTexts = state.eligibleCandidates.map(
    (c) => `${c.code} ${c.title}. ${c.description ?? ""}`,
  );
  const [interestVec, ...candidateVecs] = await embedBatch([interestText, ...candidateTexts]);

  const candidateEmbeds = new Map<string, number[]>();
  state.eligibleCandidates.forEach((c, i) => {
    const vec = candidateVecs[i];
    if (vec) candidateEmbeds.set(c.code, vec);
  });

  const getInterestScore = (c: CourseCatalogEntry): number => {
    const vec = candidateEmbeds.get(c.code);
    if (!vec || !interestVec) return 0;
    return Math.max(0, cosineSimilarity(interestVec, vec));
  };

  const ranked = rankCandidates(
    state.eligibleCandidates,
    state.takenCodes,
    getInterestScore,
    CANDIDATE_POOL,
  );
  return { ranked, interestText };
}

async function llmRationalizeNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.ranked) {
    throw new Error("llmRationalize called before ranking");
  }
  if (state.ranked.length === 0) {
    return { llmPicks: [] };
  }

  const candidatesPayload = state.ranked.map((s) => ({
    code: s.course.code,
    title: s.course.title,
    credits: s.course.credits,
    category: s.course.category,
    // Trim long catalog text so the prompt stays small but the model has
    // something concrete to reason about (was title-only → generic rationale).
    description: s.course.description ? s.course.description.slice(0, 240) : undefined,
    prereq_status:
      s.prereqDistance === 0
        ? "ready to take"
        : `${s.prereqDistance} prereq${s.prereqDistance === 1 ? "" : "s"} missing`,
    interest_match: s.interestScore.toFixed(2),
  }));

  const userPrompt = [
    `Interests: ${state.interestText ?? ""}`,
    state.program ? `Program: ${state.program}` : "",
    "\nCandidates (already eligible or 1-2 prereqs away):",
    JSON.stringify(candidatesPayload, null, 2),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text } = await generateResponse({
      task: "recommend",
      system: RECOMMEND_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.3,
      maxTokens: 800,
    });
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return { llmPicks: Array.isArray(parsed) ? parsed : [] };
  } catch (err) {
    console.warn("[recommend-graph] llmRationalize fell back — using top-scored:", err);
    return { llmPicks: [] };
  }
}

async function sanitizeNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.ranked) {
    throw new Error("sanitize called before ranking");
  }
  const validCodes = new Set(state.ranked.map((c) => c.course.code));
  const safePicks = filterLLMHallucinations(state.llmPicks ?? [], validCodes);

  const result: RecommendationOutput[] = [];
  const candidateMap = new Map(state.ranked.map((c) => [c.course.code, c]));

  for (const item of safePicks.slice(0, RESULT_COUNT)) {
    const c = candidateMap.get(item.code);
    if (!c) continue;
    result.push({
      code: c.course.code,
      title: c.course.title,
      credits: c.course.credits,
      category: c.course.category ?? null,
      why: item.why,
      score: c.totalScore,
      reasons: c.reasons,
    });
  }

  // Fallback fill from top-scored if LLM gave us fewer than RESULT_COUNT.
  if (result.length < RESULT_COUNT) {
    for (const c of state.ranked) {
      if (result.find((r) => r.code === c.course.code)) continue;
      result.push({
        code: c.course.code,
        title: c.course.title,
        credits: c.course.credits,
        category: c.course.category ?? null,
        why: `Top match for your interests (${(c.interestScore * 100).toFixed(0)}% similarity${
          c.prereqDistance === 0 ? "" : `, ${c.prereqDistance} prereq away`
        }).`,
        score: c.totalScore,
        reasons: c.reasons,
      });
      if (result.length >= RESULT_COUNT) break;
    }
  }

  return { recommendations: result };
}

// ---------- Graph construction ---------------------------------------------

const channels = {
  userId: null,
  interests: null,
  categoryFilter: null,
  takenCodes: null,
  excludeCodes: null,
  program: null,
  catalog: null,
  eligibleCandidates: null,
  ranked: null,
  interestText: null,
  llmPicks: null,
  recommendations: null,
};

const builder = new StateGraph<GraphState>({ channels })
  .addNode("loadSignalsStep", loadSignalsNode)
  .addNode("filterEligibleStep", filterEligibleNode)
  .addNode("rankCandidatesStep", rankCandidatesNode)
  .addNode("llmRationalizeStep", llmRationalizeNode)
  .addNode("sanitizeStep", sanitizeNode)
  .addEdge(START, "loadSignalsStep")
  .addEdge("loadSignalsStep", "filterEligibleStep")
  .addEdge("filterEligibleStep", "rankCandidatesStep")
  .addEdge("rankCandidatesStep", "llmRationalizeStep")
  .addEdge("llmRationalizeStep", "sanitizeStep")
  .addEdge("sanitizeStep", END);

export const recommendGraph = builder.compile();

// ---------- Public entry point ---------------------------------------------

export interface RecommendInput {
  userId: string;
  interests?: string[];
  categoryFilter?: CategoryName[];
}

export async function runRecommendationGraph(
  input: RecommendInput,
): Promise<RecommendationOutput[]> {
  const result = (await recommendGraph.invoke({
    userId: input.userId,
    interests: input.interests ?? [],
    categoryFilter: input.categoryFilter,
  })) as unknown as GraphState;
  return result.recommendations ?? [];
}
