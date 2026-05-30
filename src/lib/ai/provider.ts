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
import { streamText } from "ai";
import { checkQuota, recordGroqUsage } from "./groq-quota";
import type { LlmProvider } from "./llm-port";
import { groqProvider } from "./providers/groq-provider";
import { openRouterProvider } from "./providers/openrouter-provider";
import type { AITask, GroqModel } from "./types";

// The non-streaming model round-trip goes through this injectable port so
// retry/backoff/quota are unit-testable against a fake (no live key). Streaming
// stays on the Vercel SDK directly (its result shape is the route's contract).
let activeProvider: LlmProvider = groqProvider;

// Cross-provider fallback (task #101). When Groq exhausts retries with a
// retryable error (429/5xx), we fall back to OpenRouter free models. Separate
// seam so tests can inject a fake fallback independently of the primary.
let fallbackProvider: LlmProvider = openRouterProvider;

/** TEST-ONLY: swap the primary LLM provider (e.g. a fake that throws 429s). */
export function _setLlmProviderForTesting(provider: LlmProvider): void {
  activeProvider = provider;
}
/** TEST-ONLY: restore the real Groq provider. */
export function _resetLlmProviderForTesting(): void {
  activeProvider = groqProvider;
}
/** TEST-ONLY: swap the fallback provider. */
export function _setFallbackProviderForTesting(provider: LlmProvider): void {
  fallbackProvider = provider;
}
/** TEST-ONLY: restore the real OpenRouter fallback. */
export function _resetFallbackProviderForTesting(): void {
  fallbackProvider = openRouterProvider;
}

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

export interface GenerateResult {
  text: string;
  /** The Groq model selected for the request (for usage accounting). */
  model: GroqModel;
  usage: { tokens: number };
  /** Which backend actually served the response. */
  servedBy: "groq" | "openrouter";
}

/** Generate a complete (non-streaming) response. Used for recommendations, insights, etc.
 *
 * Fallback chain (task #101):
 *   1. Groq @ selected model, with retry/backoff honoring Retry-After.
 *   2. If the selected model was 70B and Groq still fails retryably, retry on
 *      Groq 8B (cheaper, far higher RPD) before leaving Groq.
 *   3. If Groq is fully exhausted (retryable failure), fall back to OpenRouter
 *      free models. OpenRouter has its own never-spend guards; if it's
 *      unavailable we surface the original Groq error.
 */
export async function generateResponse(opts: CallOptions): Promise<GenerateResult> {
  const primaryModel = selectModel(opts.task);

  // Circuit breaker — refuse to hit Groq if we're already at 85%+ of the daily cap.
  // Note: we DON'T short-circuit to a hard 503 anymore — a throttled primary is
  // exactly when the OpenRouter fallback earns its keep. We skip Groq and go
  // straight to fallback.
  const quota = checkQuota(primaryModel);
  const groqThrottled = quota.shouldThrottle;

  let lastErr: unknown;

  if (!groqThrottled) {
    // Try Groq at the selected model, then (if 70B) downgrade to 8B.
    const groqModels: GroqModel[] =
      primaryModel === "llama-3.3-70b-versatile"
        ? ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
        : [primaryModel];

    for (const model of groqModels) {
      const result = await tryGroq(model, opts);
      if (result.ok) {
        recordGroqUsage(model, result.value.usage.tokens);
        return { text: result.value.text, model, usage: result.value.usage, servedBy: "groq" };
      }
      lastErr = result.err;
      // Only roll to the next Groq model / fallback on a retryable failure.
      if (!isRetryable(result.err)) break;
    }
  }

  // Groq exhausted (or throttled). Try the OpenRouter free fallback.
  if (groqThrottled || isRetryable(lastErr) || lastErr === undefined) {
    try {
      const fb = await fallbackProvider.generate({
        model: primaryModel, // ignored by OpenRouter (uses its free allowlist)
        system: opts.system,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      });
      return { text: fb.text, model: primaryModel, usage: fb.usage, servedBy: "openrouter" };
    } catch (fbErr) {
      // Fallback failed too — fall through to the Groq error surface below.
      if (groqThrottled && lastErr === undefined) lastErr = fbErr;
    }
  }

  if (groqThrottled && lastErr === undefined) {
    throw new AIError(
      `Daily AI quota nearly exhausted (${quota.reason}) and fallback unavailable. Try again after UTC midnight.`,
      { status: 503, retryable: false },
    );
  }

  const status = statusOf(lastErr);
  throw new AIError(
    status === 429
      ? "AI rate limit hit (Groq + fallback). Try again in a few minutes."
      : "AI provider unavailable. Try again shortly.",
    { status: status === 429 ? 429 : 503, retryable: isRetryable(lastErr) },
  );
}

type TryResult =
  | { ok: true; value: { text: string; usage: { tokens: number } } }
  | { ok: false; err: unknown };

/** One Groq model with retry/backoff. Returns a result union rather than throwing
 * so the caller can decide whether to downgrade / fall back. */
async function tryGroq(model: GroqModel, opts: CallOptions): Promise<TryResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await activeProvider.generate({
        model,
        system: opts.system,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        maxTokens: opts.maxTokens,
      });
      return { ok: true, value: { text: result.text, usage: result.usage } };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) break;
      const headerWait = retryAfterMsFromError(err);
      const wait = headerWait ?? 1000 * 2 ** attempt; // 1s, 2s, 4s
      await sleep(wait);
    }
  }
  return { ok: false, err: lastErr };
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
