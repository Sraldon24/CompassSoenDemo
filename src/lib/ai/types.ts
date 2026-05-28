/**
 * Shared AI types. Single source of truth for task → model routing.
 */

export type AITask =
  | "chat-simple"
  | "chat-complex"
  | "recommend"
  | "reddit-summarize"
  | "email-draft"
  | "search"
  | "dashboard-insight"
  | "workload-explanation";

export type GroqModel = "llama-3.1-8b-instant" | "llama-3.3-70b-versatile";

export interface RAGSource {
  /** Stable identifier for the source — e.g. "course:COMP 352" or "reddit:abc123". */
  id: string;
  /** Short label rendered as the citation chip. */
  label: string;
  /** Human-friendly URL where the source can be inspected; optional. */
  url?: string;
  /** The actual content slice included in the prompt (for debugging). */
  snippet: string;
  /** Cosine similarity score from the vector search (0-1). */
  score: number;
  kind: "course" | "reddit" | "plan";
}

export interface RAGContext {
  /** Markdown block ready to inject into the system prompt. */
  text: string;
  sources: RAGSource[];
}
