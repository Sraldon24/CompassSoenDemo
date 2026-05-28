/**
 * AI provider — Groq only for v1. Gemini fallback deferred per ADR-012.
 *
 * Behavior:
 *   - selectModel(task) routes by complexity: simple/search → 8B instant,
 *     complex/recommend/summarize/email → 70B versatile.
 *   - callGroqWithBackoff retries on 429 / 5xx with exponential backoff
 *     (1s, 2s, 4s). Throws AIError after the final attempt.
 *   - All callers use generateResponse() OR streamResponse() — never call
 *     the Groq SDK directly.
 */

import { groq } from "@ai-sdk/groq";
import { generateText, streamText } from "ai";
import { checkQuota, recordGroqUsage } from "./groq-quota";
import type { AITask, GroqModel } from "./types";

if (!process.env.GROQ_API_KEY) {
  // Don't throw at module load — let Better Auth + plan pages keep rendering
  // even if AI isn't configured locally. The route handler will surface a
  // friendly 500 if a request actually needs the LLM.
  console.warn("[ai] GROQ_API_KEY is not set — chat + recommendations will return 503.");
}

export function selectModel(task: AITask): GroqModel {
  switch (task) {
    case "chat-simple":
    case "search":
    case "workload-explanation":
      return "llama-3.1-8b-instant";
    case "chat-complex":
    case "recommend":
    case "reddit-summarize":
    case "email-draft":
    case "dashboard-insight":
      return "llama-3.3-70b-versatile";
  }
}

export class AIError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, opts: { status: number; retryable: boolean }) {
    super(message);
    this.name = "AIError";
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

interface CallOptions {
  task: AITask;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  /** Override for tests. Defaults to 3. */
  maxAttempts?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; cause?: { status?: number } };
  const status = e?.status ?? e?.statusCode ?? e?.cause?.status;
  if (!status) return false;
  return status === 429 || (status >= 500 && status <= 599);
}

function statusOf(err: unknown): number {
  const e = err as { status?: number; statusCode?: number; cause?: { status?: number } };
  return e?.status ?? e?.statusCode ?? e?.cause?.status ?? 500;
}

/**
 * Parse Groq's Retry-After header (or X-RateLimit-Reset-Requests) from a 429 error.
 * Header value is in seconds. Returns ms or null if not present.
 */
function retryAfterMsFromError(err: unknown): number | null {
  const e = err as {
    headers?: Record<string, string | string[]>;
    response?: { headers?: Record<string, string | string[]> };
    cause?: { headers?: Record<string, string | string[]> };
  };
  const headers =
    e?.headers ?? e?.response?.headers ?? e?.cause?.headers ?? ({} as Record<string, string>);
  const raw =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers["x-ratelimit-reset-requests"] ??
    null;
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) return null;
  const seconds = Number(val);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  // Cap at 60s — we don't want callers blocked for minutes.
  return Math.min(seconds, 60) * 1000;
}

/** Generate a complete (non-streaming) response. Used for recommendations, insights, etc. */
export async function generateResponse(
  opts: CallOptions,
): Promise<{ text: string; model: GroqModel; usage: { tokens: number } }> {
  const model = selectModel(opts.task);
  const maxAttempts = opts.maxAttempts ?? 3;

  // Circuit breaker — refuse to hit Groq if we're already at 85%+ of the daily cap.
  // Better to surface a clean 503 than burn the last few requests on retries.
  const quota = checkQuota(model);
  if (quota.shouldThrottle) {
    throw new AIError(
      `Daily AI quota nearly exhausted (${quota.reason}). Try again after UTC midnight.`,
      { status: 503, retryable: false },
    );
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await generateText({
        model: groq(model),
        system: opts.system,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        maxRetries: 0, // we handle retries ourselves
      });
      // Record system-wide usage so circuit breaker stays accurate.
      recordGroqUsage(model, result.usage?.totalTokens ?? 0);
      return {
        text: result.text,
        model,
        usage: { tokens: result.usage?.totalTokens ?? 0 },
      };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) break;
      // Honor Groq's Retry-After header if present; fall back to exponential.
      const headerWait = retryAfterMsFromError(err);
      const wait = headerWait ?? 1000 * 2 ** attempt; // 1s, 2s, 4s
      await sleep(wait);
    }
  }
  const status = statusOf(lastErr);
  throw new AIError(
    status === 429
      ? "Groq rate limit hit. Try again in a few minutes."
      : "AI provider unavailable. Try again shortly.",
    { status: status === 429 ? 429 : 503, retryable: isRetryable(lastErr) },
  );
}

/**
 * Stream tokens via the Vercel AI SDK. Caller receives a `streamText` result
 * that can be returned directly from a Next.js route handler with
 * `.toAIStreamResponse()` / `.toTextStreamResponse()`.
 *
 * Per ADR-011 + ADR-012: this MUST honor the system-wide Groq quota. We
 * (1) check the circuit breaker before invoking, and (2) call `onFinish` to
 * record actual token usage when the stream completes — so subsequent
 * `checkQuota()` calls see accurate numbers.
 */
export function streamResponse(opts: CallOptions): ReturnType<typeof streamText> {
  const model = selectModel(opts.task);

  // Circuit breaker — refuse to hit Groq if we're already at 85%+ of daily cap.
  const quota = checkQuota(model);
  if (quota.shouldThrottle) {
    throw new AIError(
      `Daily AI quota nearly exhausted (${quota.reason}). Try again after UTC midnight.`,
      { status: 503, retryable: false },
    );
  }

  return streamText({
    model: groq(model),
    system: opts.system,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    maxRetries: opts.maxAttempts ?? 2,
    onFinish: ({ usage }) => {
      recordGroqUsage(model, usage?.totalTokens ?? 0);
    },
  });
}
