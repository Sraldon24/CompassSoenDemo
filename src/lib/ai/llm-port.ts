/**
 * LLM provider port — the true-external seam over the raw model round-trip.
 *
 * The port is intentionally thin and dumb: one model call in, `{text, usage}`
 * out, or it throws a status-bearing error. It does NOT retry, route models, or
 * track quota — those are OUR deterministic policies and live in `provider.ts`
 * (on our side of the seam), so they're unit-testable against a fake.
 *
 * Real adapter: `providers/groq-provider.ts` (the only importer of @ai-sdk/groq).
 * Test adapter: `providers/fake-provider.ts` (programmable 429s, canned text).
 */

export interface LlmCallInput {
  /** Resolved model id (port-agnostic string). */
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmGenerateResult {
  text: string;
  usage: { tokens: number };
}

export interface LlmProvider {
  /** One non-streaming model round-trip. Throws a status-bearing error on failure. */
  generate(input: LlmCallInput): Promise<LlmGenerateResult>;
}
