/**
 * AI provider — Groq only for v1. Gemini fallback deferred per ADR-012.
 *
 * Behavior:
 *   - selectModel(task) routes by complexity: simple/search → 8B instant,
 *     complex/recommend/summarize/email → 70B versatile.
 *   - callGroqWithBackoff retries on 429 / 5xx with exponential backoff
 *     (1s, 2s, 4s). Throws AIError after the final attempt.
 *   - All callers use generateResponse() OR streamChatWithFallback() — never
 *     call the Groq SDK directly.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
  /** Chat router: skip the deep (70B) model and go straight to the fast model. */
  preferFast?: boolean;
  /** Force a specific Groq model, bypassing task-based selection. Used by the
   * summarize graph to run cheap extraction nodes on 8B while keeping 70B for
   * the quality-critical ones. Still falls back to 8B/OpenRouter on failure. */
  modelOverride?: GroqModel;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Transient network failures carry no HTTP status but should still retry/fall
 * back (a dropped socket to Groq is exactly when the 8B/OpenRouter chain helps). */
function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; name?: string; message?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code;
  if (code && ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"].includes(code)) {
    return true;
  }
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true;
  const msg = (e?.message ?? "").toLowerCase();
  return msg.includes("fetch failed") || msg.includes("network") || msg.includes("socket hang up");
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; cause?: { status?: number } };
  const status = e?.status ?? e?.statusCode ?? e?.cause?.status;
  if (!status) return isNetworkError(err);
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
  const primaryModel = opts.modelOverride ?? selectModel(opts.task);

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

// ── Speed upgrade: quality-first streaming with a latency fallback ───────────
// Gemini Flash (Google AI Studio free tier) is fast + free. Configured only if a
// key is present, so the app still runs Groq-only without it.
// NOTE: gemini-2.0-flash has free-tier quota 0 on our key; gemini-2.5-flash works
// (verified ~1.2s, gemini-2.5-flash-lite ~0.4s). Use 2.5-flash for the best
// quality/speed balance on the free tier.
// Accept either env var name: GEMINI_API_KEY (what we set) or the SDK's default.
const GEMINI_MODEL = "gemini-2.5-flash";
const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null;
const gemini = geminiKey ? createGoogleGenerativeAI({ apiKey: geminiKey }) : null;

/** How long we wait for the primary (70B) to emit its first token before
 * abandoning it for a faster model. Groq free-tier 70B can take ~40s to start. */
const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/** Matches the `ai_model` DB enum so it can be persisted directly. */
export type ServedModel =
  | "groq-llama-3.3-70b"
  | "groq-llama-3.1-8b"
  | "gemini-2.0-flash"
  | "gemini-2.5-flash";

/**
 * Balanced router: decide if a chat message warrants the deep model (70B) or
 * the fast model (Gemini). No extra LLM call — a cheap heuristic on the text.
 * Deep when the question is long or strategic (multi-course sequencing, "plan
 * my degree", comparisons); fast for quick lookups ("prereq for COMP 352?").
 */
export function isComplexQuery(message: string): boolean {
  const m = message.toLowerCase();
  if (message.length > 280) return true;
  // Count distinct course-code mentions — comparing/sequencing many courses is deep.
  const codes = new Set(m.match(/[a-z]{3,4}\s?\d{3}/g) ?? []);
  if (codes.size >= 3) return true;
  const deepSignals = [
    "plan my",
    "whole degree",
    "four year",
    "4 year",
    "4-year",
    "sequence",
    "schedule my",
    "which should i",
    "compare",
    "vs ",
    "trade-off",
    "tradeoff",
    "best order",
    "what if i",
    "graduate early",
    "minor in",
    "too heavy",
    "balance my",
    "strategy",
  ];
  return deepSignals.some((s) => m.includes(s));
}

export interface StreamWithFallback {
  /** Async iterable of text chunks, first-token-fast. */
  textStream: AsyncIterable<string>;
  /** Which backend ultimately served the stream (known after first token). */
  servedBy: () => ServedModel;
}

/**
 * Pure routing decision for the chat stream: should we attempt the deep model
 * (Groq 70B, with the latency race) or go straight to the fast model?
 *
 * Extracted from streamChatWithFallback so the branch logic is unit-testable
 * without a live LLM/stream. Skip the deep model when the caller asked for fast
 * (simple query) OR the 70B daily quota is already throttled.
 */
export function shouldAttemptDeepModel(input: {
  preferFast?: boolean;
  quotaThrottled: boolean;
}): boolean {
  if (input.preferFast) return false;
  if (input.quotaThrottled) return false;
  return true;
}

/**
 * Stream the answer with QUALITY FIRST but a hard latency ceiling:
 *   1. Start Groq 70B (best quality). Race its first token against an ~8s timeout.
 *   2. If 70B produces a token in time → stream it fully (quality path).
 *   3. If 70B is too slow OR errors → abandon it and restream on the fastest
 *      available model: Gemini 2.0 Flash if configured, else Groq 8B-instant.
 *
 * Token usage is recorded via onFinish on whichever Groq stream actually runs.
 */
export function streamChatWithFallback(opts: CallOptions): StreamWithFallback {
  // Circuit breaker still applies to the 70B primary.
  const primary: GroqModel = "llama-3.3-70b-versatile";
  let served: ServedModel = "groq-llama-3.3-70b";

  const fastStream = () => {
    if (gemini) {
      served = "gemini-2.5-flash"; // label the model we actually stream (was mislabeled 2.0)
      // Fast, free, no Groq quota impact.
      return streamText({
        model: gemini(GEMINI_MODEL),
        system: opts.system,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
        maxRetries: 1,
      }).textStream;
    }
    served = "groq-llama-3.1-8b";
    return streamText({
      model: groq("llama-3.1-8b-instant"),
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      maxRetries: 1,
      onFinish: ({ usage }) => recordGroqUsage("llama-3.1-8b-instant", usage?.totalTokens ?? 0),
    }).textStream;
  };

  async function* generate(): AsyncIterable<string> {
    // Balanced router (pure decision): simple queries and a throttled 70B quota
    // both skip the deep model and stream from the fast path immediately.
    const quota = checkQuota(primary);
    if (
      !shouldAttemptDeepModel({ preferFast: opts.preferFast, quotaThrottled: quota.shouldThrottle })
    ) {
      yield* fastStream();
      return;
    }

    const primaryResult = streamText({
      model: groq(primary),
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      maxRetries: 1,
      onFinish: ({ usage }) => recordGroqUsage(primary, usage?.totalTokens ?? 0),
    });

    const iterator = primaryResult.textStream[Symbol.asyncIterator]();

    // Race the FIRST chunk against the timeout.
    let first: IteratorResult<string>;
    try {
      first = await Promise.race([
        iterator.next(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("primary-first-token-timeout")),
            FIRST_TOKEN_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch {
      // 70B too slow or errored before first token — drop it, use the fast model.
      iterator.return?.().catch(() => {});
      yield* fastStream();
      return;
    }

    // 70B answered in time — stream it fully (quality path).
    if (!first.done && first.value) yield first.value;
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      if (next.value) yield next.value;
    }
  }

  return { textStream: generate(), servedBy: () => served };
}
