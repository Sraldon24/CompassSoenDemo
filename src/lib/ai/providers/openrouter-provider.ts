/**
 * OpenRouter provider — cross-provider FALLBACK adapter (task #101).
 *
 * Used only when Groq (70B then 8B) is rate-limited or down. Calls OpenRouter's
 * OpenAI-compatible REST endpoint directly (no SDK dependency) so we keep tight
 * control over the never-spend guards.
 *
 * ░░ NEVER-SPEND GUARDS (see memory: project-openrouter-never-spend) ░░
 *   1. ALLOWLIST: only model ids ending in ":free" are ever sent. Any other id
 *      throws before the HTTP call. No env-var escape hatch.
 *   2. PRE-FLIGHT BALANCE: once per process, GET /auth/key and assert usage===0.
 *      If usage > 0, OpenRouter is disabled for the session (we may have started
 *      spending — stop immediately).
 *   3. MODEL ROTATION: free models flap in/out of upstream 429s, so we try a
 *      pre-vetted list in order and only fail after all are exhausted.
 *
 * The $5 credit on the account exists ONLY to unlock the 1,000/day free tier —
 * it must never be drawn down.
 */

import type { LlmCallInput, LlmGenerateResult, LlmProvider } from "../llm-port";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";

/** Pre-vetted free models, in priority order. All end in ":free" (guard #1). */
export const OPENROUTER_FREE_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
] as const;

const REFERER = "https://github.com/Sraldon24/CompassSoenDemo";
const TITLE = "SOEN Compass";

export class OpenRouterDisabledError extends Error {
  constructor(reason: string) {
    super(`OpenRouter fallback disabled: ${reason}`);
    this.name = "OpenRouterDisabledError";
  }
}

/** Guard #1: refuse any non-free model before it can cost money. */
export function assertFreeModel(model: string): void {
  if (!model.endsWith(":free")) {
    throw new OpenRouterDisabledError(
      `model "${model}" is not a :free model — paid models are disabled by policy`,
    );
  }
}

// Guard #2 state — pre-flight balance check, memoized per process.
let balanceCheck: Promise<boolean> | null = null;

/**
 * Returns true if the key has $0 usage (safe to use free models). Memoized so
 * we only hit /auth/key once per process. If usage > 0, returns false forever
 * for this process — we never want to risk drawing down the credit.
 */
export async function isOpenRouterSpendSafe(): Promise<boolean> {
  if (!process.env.OPENROUTER_API_KEY) return false;
  if (balanceCheck) return balanceCheck;

  balanceCheck = (async () => {
    try {
      const res = await fetch(OPENROUTER_KEY_URL, {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { data?: { usage?: number } };
      const usage = json?.data?.usage ?? 0;
      if (usage > 0) {
        console.error(
          `[openrouter] CRITICAL: key usage is $${usage} (expected $0). Disabling OpenRouter for this session to protect the credit.`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.warn("[openrouter] pre-flight balance check failed:", err);
      return false;
    }
  })();
  return balanceCheck;
}

/** TEST-ONLY: reset the memoized balance check. */
export function _resetOpenRouterBalanceForTesting(): void {
  balanceCheck = null;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
  error?: { message?: string; code?: number };
}

async function callOneModel(model: string, input: LlmCallInput): Promise<LlmGenerateResult> {
  assertFreeModel(model); // guard #1, defense-in-depth per call

  const res = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": REFERER,
      "X-Title": TITLE,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: input.system }, ...input.messages],
      temperature: input.temperature ?? 0.4,
      max_tokens: input.maxTokens ?? 800,
    }),
  });

  const json = (await res.json()) as ChatCompletionResponse;
  if (!res.ok) {
    const status = json?.error?.code ?? res.status;
    const err = new Error(json?.error?.message ?? `OpenRouter ${status}`) as Error & {
      status: number;
    };
    err.status = status;
    throw err;
  }

  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenRouter returned empty content");
  return { text, usage: { tokens: json.usage?.total_tokens ?? 0 } };
}

/**
 * The fallback provider. Tries each free model in order until one succeeds.
 * Guard #2 runs first (pre-flight balance). Ignores the caller's `input.model`
 * — it always uses the free allowlist, never the Groq model id.
 */
export const openRouterProvider: LlmProvider = {
  async generate(input: LlmCallInput): Promise<LlmGenerateResult> {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new OpenRouterDisabledError("OPENROUTER_API_KEY not set");
    }
    if (!(await isOpenRouterSpendSafe())) {
      throw new OpenRouterDisabledError(
        "pre-flight balance check failed (usage > 0 or unreachable)",
      );
    }

    let lastErr: unknown;
    for (const model of OPENROUTER_FREE_MODELS) {
      try {
        return await callOneModel(model, input);
      } catch (err) {
        lastErr = err;
        // 429 / upstream throttle on this model → try the next free model.
        // Any other error also rolls to the next model (best-effort fallback).
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : "all free models exhausted";
    const err = new Error(`OpenRouter: all free models failed (${msg})`) as Error & {
      status: number;
    };
    err.status = 503;
    throw err;
  },
};
