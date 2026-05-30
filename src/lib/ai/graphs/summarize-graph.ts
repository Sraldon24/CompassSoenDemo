/**
 * Reddit thread summarization graph (LangGraph v1).
 *
 * State machine:
 *   START → loadPosts → classifySignal → extractProfMentions
 *         → extractComplaintsAndPraise → rateDifficulty → emitSummary → END
 *
 * Why multi-step instead of one giant prompt?
 *   - Each node uses a small focused prompt → less hallucination per call.
 *   - Deterministic logic between LLM calls: dedupe prof names (normalize
 *     casing + diacritics), drop low-score posts before difficulty rating,
 *     hard-cap citation list to what exists in input.
 *   - Failures are localized — if classifySignal returns garbage we don't
 *     poison downstream nodes.
 *
 * Total Groq calls: 5 (one per LLM node). All 70B for quality.
 *
 * Output is cached in `reddit_summaries` for 7 days per course.
 */

import { END, START, StateGraph } from "@langchain/langgraph";
import { generateResponse } from "../provider";

// ---------- Public types ----------------------------------------------------

export interface SummarizeInput {
  courseCode: string;
  posts: SummarizePost[];
}

export interface SummarizePost {
  id: string;
  title: string;
  body: string;
  score: number | null;
  permalink: string;
}

export type Sentiment = "positive" | "mixed" | "negative" | "insufficient_data";
export type DifficultyEstimate = "easy" | "medium" | "hard" | "unknown";

export interface CourseSummary {
  sentiment: Sentiment;
  commonComplaints: string[];
  commonPraise: string[];
  profMentions: Array<{ name: string; count: number; sentiment: string }>;
  difficultyEstimate: DifficultyEstimate;
  citations: Array<{ permalink: string; quote: string }>;
  /** Internal — useful for debugging the chain. */
  postsConsidered: number;
}

// ---------- Internal graph state -------------------------------------------

interface GraphState {
  courseCode: string;
  posts: SummarizePost[];

  /** Set by classifySignal — whether posts contain enough signal at all. */
  sentiment?: Sentiment;

  /** Set by extractProfMentions, after dedupe. */
  profMentions?: CourseSummary["profMentions"];

  /** Set by extractComplaintsAndPraise. */
  commonComplaints?: string[];
  commonPraise?: string[];

  /** Set by rateDifficulty. */
  difficultyEstimate?: DifficultyEstimate;

  /** Set by emitSummary — final structured output. */
  citations?: CourseSummary["citations"];
}

// ---------- Helpers --------------------------------------------------------

/** Truncate post bodies so context stays small — relevant signal is usually
 * in title + first 600 chars of selftext. */
function formatPosts(posts: SummarizePost[]): string {
  return posts
    .map((p, i) => {
      const body = p.body.length > 600 ? `${p.body.slice(0, 600)}…` : p.body;
      const score = p.score ?? "?";
      return `[POST ${i + 1}] (score=${score})\nTitle: ${p.title}\nBody: ${body}\nLink: ${p.permalink}`;
    })
    .join("\n\n---\n\n");
}

/** Best-effort JSON extraction — strips ```json fences if the model added them. */
function parseJsonLoose<T>(text: string): T | null {
  const trimmed = text.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Fallback: find the first {...} block.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

/** Normalize prof name for dedupe: lowercase, strip diacritics, collapse
 * whitespace. "Dr. René Witté" and "rene witte" map to "rene witte". */
function normalizeProfName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .replace(/^(dr|prof|professor|mr|ms|mrs)\.?\s+/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Node 1: classifySignal -----------------------------------------

const CLASSIFY_SYSTEM = `You analyze Reddit posts about a Concordia course and rate overall sentiment.

Output STRICT JSON only — no prose, no fences:
{"sentiment": "positive" | "mixed" | "negative" | "insufficient_data"}

Rules:
- "insufficient_data" if fewer than 3 posts contain real opinions (vs. just questions).
- "mixed" if opinions clearly contradict each other.
- Be conservative — when in doubt, say "mixed".`;

async function classifySignalNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.posts.length === 0) {
    return { sentiment: "insufficient_data" };
  }
  const { text } = await generateResponse({
    task: "reddit-summarize",
    system: CLASSIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Course: ${state.courseCode}\n\n${formatPosts(state.posts)}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 50,
  });
  const parsed = parseJsonLoose<{ sentiment: Sentiment }>(text);
  return { sentiment: parsed?.sentiment ?? "insufficient_data" };
}

// ---------- Node 2: extractProfMentions ------------------------------------

const PROF_SYSTEM = `You extract professor name mentions from Reddit posts about a Concordia course.

Output STRICT JSON only:
{"mentions": [{"name": "Full Name", "sentiment": "positive" | "negative" | "neutral"}, ...]}

Rules:
- Only include names that clearly refer to a professor (look for "Prof", "Dr", "took with", "had", etc.).
- Do NOT include the student authors or random people.
- Use the most common spelling. Keep original capitalization.
- Empty list if no prof mentions.`;

async function extractProfMentionsNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.posts.length === 0) return { profMentions: [] };

  const { text } = await generateResponse({
    task: "reddit-summarize",
    system: PROF_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Course: ${state.courseCode}\n\n${formatPosts(state.posts)}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 300,
  });
  const parsed = parseJsonLoose<{
    mentions: Array<{ name: string; sentiment: string }>;
  }>(text);
  const raw = parsed?.mentions ?? [];

  // Deterministic dedupe: group by normalized name, count occurrences,
  // pick the longest seen spelling as canonical (so "Leila" gets folded
  // into "Leila Kosseim" rather than the reverse).
  const grouped = new Map<string, { name: string; count: number; sentiment: string }>();
  for (const m of raw) {
    if (!m.name || typeof m.name !== "string") continue;
    const key = normalizeProfName(m.name);
    if (!key) continue;
    const matchKey = findGroupKey(grouped, key);
    const existing = matchKey ? grouped.get(matchKey) : undefined;
    if (existing && matchKey) {
      existing.count += 1;
      // If this mention has a longer name, promote it to canonical and
      // re-key the group under the longer normalized form.
      if (m.name.length > existing.name.length) {
        existing.name = m.name;
        grouped.delete(matchKey);
        grouped.set(normalizeProfName(m.name), existing);
      }
      if (existing.sentiment === "neutral" && m.sentiment !== "neutral") {
        existing.sentiment = m.sentiment;
      }
    } else {
      grouped.set(key, { name: m.name, count: 1, sentiment: m.sentiment ?? "neutral" });
    }
  }

  return {
    profMentions: Array.from(grouped.values()).sort((a, b) => b.count - a.count),
  };
}

/** Returns the map key whose normalized tokens overlap with `incoming` —
 * handles the "Leila" → "Leila Kosseim" case. Tokens must share at least one
 * surname-shaped word (4+ chars). Single-token names only match if identical. */
function findGroupKey(
  grouped: Map<string, { name: string; count: number; sentiment: string }>,
  incoming: string,
): string | undefined {
  if (grouped.has(incoming)) return incoming;
  const incomingTokens = incoming.split(" ").filter((t) => t.length >= 4);
  if (incomingTokens.length === 0) return undefined;

  for (const key of grouped.keys()) {
    const keyTokens = key.split(" ").filter((t) => t.length >= 4);
    if (keyTokens.length === 0) continue;
    // Match if either set's tokens are a subset of the other.
    const incomingSet = new Set(incomingTokens);
    const keySet = new Set(keyTokens);
    const incomingFitsKey = incomingTokens.every((t) => keySet.has(t));
    const keyFitsIncoming = keyTokens.every((t) => incomingSet.has(t));
    if (incomingFitsKey || keyFitsIncoming) return key;
  }
  return undefined;
}

// ---------- Node 3: extractComplaintsAndPraise -----------------------------

const COMPLAINTS_SYSTEM = `You extract specific complaints and praise about a Concordia course from Reddit posts.

Output STRICT JSON only:
{"complaints": ["...", "..."], "praise": ["...", "..."]}

Rules:
- Be SPECIFIC. "Heavy workload" is OK; "the course is hard" is NOT (too vague).
- Each entry < 80 characters.
- Max 4 entries per list.
- Only include claims supported by at least one post in the input.
- Empty lists if nothing concrete found.`;

async function extractComplaintsAndPraiseNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.posts.length === 0) {
    return { commonComplaints: [], commonPraise: [] };
  }

  const { text } = await generateResponse({
    task: "reddit-summarize",
    system: COMPLAINTS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Course: ${state.courseCode}\n\n${formatPosts(state.posts)}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 400,
  });
  const parsed = parseJsonLoose<{ complaints: string[]; praise: string[] }>(text);

  return {
    commonComplaints: (parsed?.complaints ?? []).filter((s) => typeof s === "string").slice(0, 4),
    commonPraise: (parsed?.praise ?? []).filter((s) => typeof s === "string").slice(0, 4),
  };
}

// ---------- Node 4: rateDifficulty -----------------------------------------

const DIFFICULTY_SYSTEM = `You rate how hard a Concordia course is based on Reddit posts.

Output STRICT JSON only:
{"difficulty": "easy" | "medium" | "hard" | "unknown"}

Rules:
- "unknown" if posts don't discuss workload, exams, or difficulty.
- Consider workload, exam difficulty, project intensity, time commitment.
- Be conservative — when in doubt, lean medium.`;

async function rateDifficultyNode(state: GraphState): Promise<Partial<GraphState>> {
  // Filter low-signal posts before sending — score <= 0 is usually a question,
  // not a review. This is the deterministic pre-LLM step.
  const reviewish = state.posts.filter((p) => (p.score ?? 0) > 0);
  if (reviewish.length === 0) {
    return { difficultyEstimate: "unknown" };
  }

  const { text } = await generateResponse({
    task: "reddit-summarize",
    system: DIFFICULTY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Course: ${state.courseCode}\n\n${formatPosts(reviewish)}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 50,
  });
  const parsed = parseJsonLoose<{ difficulty: DifficultyEstimate }>(text);
  return { difficultyEstimate: parsed?.difficulty ?? "unknown" };
}

// ---------- Node 5: emitSummary -------------------------------------------

const CITATIONS_SYSTEM = `You pick the 2-4 most useful direct-quote citations from Reddit posts.

Output STRICT JSON only:
{"citations": [{"permalink": "<exact-link-from-input>", "quote": "<verbatim-snippet-from-post>"}, ...]}

Rules:
- "permalink" must EXACTLY match one of the links in the input.
- "quote" must be a verbatim snippet (< 200 chars) from that post's body or title.
- Pick quotes that are SPECIFIC and INFORMATIVE — not "this course is hard".
- 2-4 citations total. Skip if no post is quote-worthy.`;

async function emitSummaryNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.posts.length === 0) {
    return { citations: [] };
  }
  const { text } = await generateResponse({
    task: "reddit-summarize",
    system: CITATIONS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Course: ${state.courseCode}\n\n${formatPosts(state.posts)}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 400,
  });
  const parsed = parseJsonLoose<{
    citations: Array<{ permalink: string; quote: string }>;
  }>(text);
  const allowedLinks = new Set(state.posts.map((p) => p.permalink));

  // Hard guard: drop any citation whose permalink isn't in the input set —
  // prevents the LLM from inventing URLs.
  const safe = (parsed?.citations ?? []).filter(
    (c) => c && typeof c.permalink === "string" && allowedLinks.has(c.permalink),
  );

  return { citations: safe.slice(0, 4) };
}

// ---------- Graph construction --------------------------------------------

const channels = {
  courseCode: null,
  posts: null,
  sentiment: null,
  profMentions: null,
  commonComplaints: null,
  commonPraise: null,
  difficultyEstimate: null,
  citations: null,
};

const builder = new StateGraph<GraphState>({ channels })
  .addNode("classifySignalStep", classifySignalNode)
  .addNode("extractProfMentionsStep", extractProfMentionsNode)
  .addNode("extractComplaintsAndPraiseStep", extractComplaintsAndPraiseNode)
  .addNode("rateDifficultyStep", rateDifficultyNode)
  .addNode("emitSummaryStep", emitSummaryNode)
  .addEdge(START, "classifySignalStep")
  .addEdge("classifySignalStep", "extractProfMentionsStep")
  .addEdge("extractProfMentionsStep", "extractComplaintsAndPraiseStep")
  .addEdge("extractComplaintsAndPraiseStep", "rateDifficultyStep")
  .addEdge("rateDifficultyStep", "emitSummaryStep")
  .addEdge("emitSummaryStep", END);

export const summarizeGraph = builder.compile();

// ---------- Public entry point --------------------------------------------

export async function runSummarizeGraph(input: SummarizeInput): Promise<CourseSummary> {
  const result = (await summarizeGraph.invoke({
    courseCode: input.courseCode,
    posts: input.posts,
  })) as unknown as GraphState;

  return {
    sentiment: result.sentiment ?? "insufficient_data",
    commonComplaints: result.commonComplaints ?? [],
    commonPraise: result.commonPraise ?? [],
    profMentions: result.profMentions ?? [],
    difficultyEstimate: result.difficultyEstimate ?? "unknown",
    citations: result.citations ?? [],
    postsConsidered: input.posts.length,
  };
}

// Exposed for unit tests — pure helpers, no LLM.
export const _testing = { normalizeProfName, parseJsonLoose, formatPosts, findGroupKey };
