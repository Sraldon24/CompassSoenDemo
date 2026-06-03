/**
 * RAG context builder.
 *
 * 1. Embed the user query (local sentence-transformers, ~50ms warm).
 * 2. pgvector cosine search across course_embeddings (top 5) and
 *    reddit_embeddings (top 5, empty until Phase 4 wiring).
 * 3. Pull each top course's plan status for the asking user so the LLM
 *    knows where the course sits in their own degree.
 * 4. Return { text, sources } — text injected into the system prompt, sources
 *    surfaced as citation chips below the AI message.
 */

import { db } from "@/lib/data/db";
import { courses, userCourses } from "@/lib/data/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { embed } from "./embeddings";
import type { RAGContext, RAGSource } from "./types";

const COURSE_CODE_RE = /\b([A-Z]{3,4})\s*(\d{3})\b/g;

/** Pure: pull "COMP 472"-style codes out of a question (deduped, normalized). */
export function extractCodesFromQuery(query: string): string[] {
  const out = new Set<string>();
  for (const m of query.matchAll(COURSE_CODE_RE)) {
    out.add(`${m[1]} ${m[2]}`);
  }
  return [...out];
}

const COURSE_TOP_K = 5;
const REDDIT_TOP_K = 5;
const MAX_CONTEXT_CHARS = 4_500;

// ── Pure assembly layer ──────────────────────────────────────────────────────
// Row shapes the assembler consumes. Kept structural (not DB-tied) so the
// assembly logic — section ordering, scoring (1 - distance), force-include,
// truncation — is unit-testable with canned hits, no DB or pgvector.

export interface PlanRow {
  courseCode: string;
  term: string | null;
  status: string;
}
export interface ExplicitHit {
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  credits: number;
  prereqs: { all?: string[]; any?: string[]; concurrent?: string[] } | null;
}
export interface CourseHit {
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  credits: number;
  distance: number;
}
export interface RedditHit {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  distance: number;
}

export interface RAGAssemblyInput {
  explicitHits: ExplicitHit[];
  courseHits: CourseHit[];
  redditHits: RedditHit[];
  planByCode: Map<string, PlanRow>;
}

/**
 * Pure: turn fetched hits into the { text, sources } RAG context. No I/O.
 * - explicit-mention courses come FIRST (force-included, score 1.0)
 * - semantic course matches scored as max(0, 1 - cosine distance)
 * - reddit discussion last
 * - final text capped at MAX_CONTEXT_CHARS
 */
export function assembleRAGContext(input: RAGAssemblyInput): RAGContext {
  const { explicitHits, courseHits, redditHits, planByCode } = input;
  const sources: RAGSource[] = [];
  const sections: string[] = [];

  if (explicitHits.length > 0) {
    sections.push("## Courses you explicitly mentioned");
    explicitHits.forEach((c, i) => {
      const plan = planByCode.get(c.code);
      const planLine = plan
        ? `Your plan: ${plan.status} in ${plan.term ?? "no term"}.`
        : "Not in your plan yet.";
      const prereqs = c.prereqs;
      const prereqLine = prereqs
        ? `Prereqs: all=${(prereqs.all ?? []).join(", ") || "none"}; any=${(prereqs.any ?? []).join(", ") || "none"}; concurrent=${(prereqs.concurrent ?? []).join(", ") || "none"}.`
        : "Prereqs: none recorded.";
      sources.push({
        id: `course:${c.code}`,
        label: `${c.code} catalog`,
        snippet: (c.description ?? "").slice(0, 240),
        score: 1.0,
        kind: "course",
      });
      sections.push(
        `[E${i + 1}] ${c.code} — ${c.title} (${c.credits} cr, ${c.category ?? "uncategorized"})\n${prereqLine}\n${c.description ? `${c.description.slice(0, 600)}\n` : ""}${planLine}\n`,
      );
    });
  }

  if (courseHits.length > 0) {
    sections.push("## Course catalog matches");
    courseHits.forEach((c, i) => {
      const plan = planByCode.get(c.code);
      const planLine = plan ? `Student's plan: ${plan.status} in ${plan.term ?? "no term"}.` : "";
      sources.push({
        id: `course:${c.code}`,
        label: `${c.code} catalog`,
        snippet: (c.description ?? "").slice(0, 240),
        score: Math.max(0, 1 - c.distance),
        kind: "course",
      });
      sections.push(
        `[${i + 1}] ${c.code} — ${c.title} (${c.credits} cr, ${c.category ?? "uncategorized"})\n${c.description ? `${c.description.slice(0, 600)}\n` : ""}${planLine ? `${planLine}\n` : ""}`,
      );
    });
  }

  if (redditHits.length > 0) {
    sections.push("## Recent Reddit discussion");
    redditHits.forEach((r, i) => {
      sources.push({
        id: `reddit:${r.id}`,
        label: `r/Concordia: ${r.title.slice(0, 60)}`,
        url: r.url ?? undefined,
        snippet: (r.body ?? r.title).slice(0, 240),
        score: Math.max(0, 1 - r.distance),
        kind: "reddit",
      });
      sections.push(
        `[${courseHits.length + i + 1}] r/Concordia "${r.title}"\n${(r.body ?? "").slice(0, 400)}\n`,
      );
    });
  }

  let text = sections.join("\n\n");
  if (text.length > MAX_CONTEXT_CHARS) {
    text = `${text.slice(0, MAX_CONTEXT_CHARS)}\n…(context truncated)`;
  }
  return { text, sources };
}

interface BuildRAGOptions {
  query: string;
  userId: string;
}

export async function buildRAGContext({ query, userId }: BuildRAGOptions): Promise<RAGContext> {
  const queryVector = await embed(query);

  // First — force-include any course the user named in their question. This
  // catches the very common "when can I take COMP 472?" pattern where the
  // semantic search alone wouldn't necessarily surface that exact course.
  const explicitCodes = extractCodesFromQuery(query);
  const explicitHits = explicitCodes.length
    ? await db
        .select({
          code: courses.code,
          title: courses.title,
          description: courses.description,
          category: courses.category,
          credits: courses.credits,
          prereqs: courses.prereqs,
        })
        .from(courses)
        .where(inArray(courses.code, explicitCodes))
    : [];

  // pgvector cosine similarity: smaller distance = closer.
  // `<=>` returns the cosine distance; convert to similarity via (1 - dist).
  // We exclude codes the user explicitly mentioned (those are already in
  // `explicitHits`) using a Postgres text[] cast — note the JSON.stringify
  // approach lets drizzle's sql tag pass it as a single typed param.
  const excludeJSON = JSON.stringify(explicitCodes); // []  or  ["COMP 472"]
  const courseHits = await db.execute<{
    code: string;
    title: string;
    description: string | null;
    category: string | null;
    credits: number;
    distance: number;
  }>(sql`
      SELECT c.code, c.title, c.description, c.category, c.credits,
             ce.embedding <=> ${JSON.stringify(queryVector)}::vector AS distance
      FROM course_embeddings ce
      JOIN courses c ON c.code = ce.course_code
      WHERE c.code NOT IN (
        SELECT jsonb_array_elements_text(${excludeJSON}::jsonb)
      )
      ORDER BY distance ASC
      LIMIT ${COURSE_TOP_K}
    `);

  const redditHits = await db.execute<{
    id: string;
    title: string;
    body: string | null;
    url: string | null;
    course_code: string | null;
    distance: number;
  }>(sql`
      SELECT rp.id, rp.title, rp.body, rp.url, rp.course_code,
             re.embedding <=> ${JSON.stringify(queryVector)}::vector AS distance
      FROM reddit_embeddings re
      JOIN reddit_posts rp ON rp.id = re.post_id
      ORDER BY distance ASC
      LIMIT ${REDDIT_TOP_K}
    `);

  // Pull this user's plan status for the surfaced courses so the LLM can
  // reason about "you'd be eligible Winter 2029" etc.
  const allCodes = [...explicitHits.map((c) => c.code), ...courseHits.map((c) => c.code)];
  const planRows = allCodes.length
    ? await db
        .select({
          courseCode: userCourses.courseCode,
          term: userCourses.term,
          status: userCourses.status,
        })
        .from(userCourses)
        .where(and(eq(userCourses.userId, userId), inArray(userCourses.courseCode, allCodes)))
    : [];
  const planByCode = new Map(planRows.map((r) => [r.courseCode, r]));

  // Pure assembly — testable in isolation (see assembleRAGContext above).
  return assembleRAGContext({
    explicitHits: explicitHits.map((c) => ({
      ...c,
      prereqs: c.prereqs as ExplicitHit["prereqs"],
    })),
    courseHits,
    redditHits: redditHits.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url,
      distance: r.distance,
    })),
    planByCode,
  });
}

/** Cheap helper for the UI: how many sources are good enough to surface? */
export function filterUsefulSources(sources: RAGSource[], minScore = 0.2): RAGSource[] {
  return sources.filter((s) => s.score >= minScore);
}
