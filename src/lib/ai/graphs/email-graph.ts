/**
 * Email-drafting graph (LangGraph v1).
 *
 * State machine:
 *   START → gatherContext → draft → critique → revise → output → END
 *
 * Why multi-step? A single Groq pass produces a competent first draft but
 * usually has filler ("I hope this email finds you well"), missing specifics,
 * or wrong tone. Forcing a critique-then-revise pass at temperature 0.2 yields
 * tighter, more professional output without exposing the intermediate text
 * to the user.
 *
 * Total Groq calls: 2 (draft @ T=0.5, revise @ T=0.2). Critique is a 1-step
 * structured prompt that the same revise call uses internally.
 */

import { END, START, StateGraph } from "@langchain/langgraph";
import { EMAIL_DRAFT_SYSTEM } from "../prompts";
import { generateResponse } from "../provider";

export type RecipientRole = "advisor" | "professor" | "coop-office" | "department" | "other";

interface GraphState {
  /** Input. */
  situation: string;
  recipientRole: RecipientRole;

  /** Populated by gatherContext (formats the user prompt for downstream). */
  formattedContext?: string;

  /** Populated by draft. */
  firstDraft?: string;

  /** Populated by critique (1-3 sentences of issues to fix). */
  critique?: string;

  /** Final output — populated by revise. */
  finalDraft?: string;
}

// ---------- Node implementations -------------------------------------------

async function gatherContextNode(state: GraphState): Promise<Partial<GraphState>> {
  const roleHint: Record<RecipientRole, string> = {
    advisor: "Concordia academic advisor",
    professor: "Concordia professor",
    "coop-office": "Concordia Co-op office staff",
    department: "Department admin staff",
    other: "Concordia staff",
  };
  const formatted = [
    `Recipient role: ${roleHint[state.recipientRole]}`,
    "",
    "Student's situation:",
    state.situation,
  ].join("\n");
  return { formattedContext: formatted };
}

async function draftNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.formattedContext) {
    throw new Error("draft called before gatherContext");
  }
  const { text } = await generateResponse({
    task: "email-draft",
    system: EMAIL_DRAFT_SYSTEM,
    messages: [{ role: "user", content: state.formattedContext }],
    temperature: 0.5,
    maxTokens: 600,
  });
  return { firstDraft: text };
}

const CRITIQUE_SYSTEM = `You are a writing editor critiquing a draft email.

Output 2–4 bullet-point issues to fix. Focus on:
- Filler phrases ("I hope this email finds you well", etc.)
- Missing specifics (dates, course codes, student ID placeholders)
- Wrong tone (too casual / too formal / passive voice overuse)
- Missing call to action

Output ONLY bullets, no preamble.`;

async function critiqueNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.firstDraft) {
    throw new Error("critique called before draft");
  }
  const { text } = await generateResponse({
    task: "chat-simple", // 8B is fine for a short critique
    system: CRITIQUE_SYSTEM,
    messages: [{ role: "user", content: `Draft to critique:\n\n${state.firstDraft}` }],
    temperature: 0.2,
    maxTokens: 250,
  });
  return { critique: text };
}

const REVISE_SYSTEM = `${EMAIL_DRAFT_SYSTEM}

You are revising a draft email based on critique. Apply the critique. Output
ONLY the revised email (subject + body). Keep [bracketed placeholders] for
anything the student should fill in themselves.`;

async function reviseNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!state.firstDraft || !state.critique || !state.formattedContext) {
    throw new Error("revise called before draft+critique");
  }
  const userPrompt = [
    "## Original context",
    state.formattedContext,
    "",
    "## First draft",
    state.firstDraft,
    "",
    "## Critique (apply these fixes)",
    state.critique,
  ].join("\n");

  const { text } = await generateResponse({
    task: "email-draft",
    system: REVISE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.2,
    maxTokens: 600,
  });
  return { finalDraft: text };
}

// ---------- Graph construction ---------------------------------------------

const channels = {
  situation: null,
  recipientRole: null,
  formattedContext: null,
  firstDraft: null,
  critique: null,
  finalDraft: null,
};

const builder = new StateGraph<GraphState>({ channels })
  .addNode("gather", gatherContextNode)
  .addNode("draftEmail", draftNode)
  .addNode("critiqueDraft", critiqueNode)
  .addNode("reviseEmail", reviseNode)
  .addEdge(START, "gather")
  .addEdge("gather", "draftEmail")
  .addEdge("draftEmail", "critiqueDraft")
  .addEdge("critiqueDraft", "reviseEmail")
  .addEdge("reviseEmail", END);

export const emailGraph = builder.compile();

// ---------- Public entry point ---------------------------------------------

export interface EmailDraftInput {
  situation: string;
  recipientRole: RecipientRole;
}

export interface EmailDraftOutput {
  /** The revised, ready-to-edit email. */
  draft: string;
  /** Internal — useful for debugging / surfacing "how the AI improved this" in v2. */
  firstDraft: string;
  critique: string;
}

export async function runEmailDraftGraph(input: EmailDraftInput): Promise<EmailDraftOutput> {
  const result = (await emailGraph.invoke({
    situation: input.situation,
    recipientRole: input.recipientRole,
  })) as unknown as GraphState;

  return {
    draft: result.finalDraft ?? result.firstDraft ?? "",
    firstDraft: result.firstDraft ?? "",
    critique: result.critique ?? "",
  };
}
