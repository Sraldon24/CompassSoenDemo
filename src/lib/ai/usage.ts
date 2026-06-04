/**
 * AI usage tracking — separate from rate-limit cache so we have an audit trail
 * even if the in-memory limiter is reset (e.g. server restart).
 */

import { db } from "@/lib/data/db";
import { aiUsage } from "@/lib/data/schema";
import type { GroqModel } from "./types";

/** The `ai_model` DB enum values (what actually gets stored). */
type AiModelEnum =
  | "groq-llama-3.1-8b"
  | "groq-llama-3.3-70b"
  | "gemini-2.0-flash"
  | "gemini-2.5-flash"
  | "cached";

/** Accept either a raw Groq model id, an already-resolved served-model enum
 * value (e.g. from streamChatWithFallback().servedBy()), or "cached". */
type UsageModel = GroqModel | AiModelEnum;

interface RecordUsageInput {
  userId: string;
  feature: string;
  model: UsageModel;
  tokensUsed: number;
}

const MODEL_MAP: Record<string, AiModelEnum> = {
  // Raw Groq SDK ids → enum
  "llama-3.1-8b-instant": "groq-llama-3.1-8b",
  "llama-3.3-70b-versatile": "groq-llama-3.3-70b",
  // Already-resolved served-model enum values → passthrough
  "groq-llama-3.1-8b": "groq-llama-3.1-8b",
  "groq-llama-3.3-70b": "groq-llama-3.3-70b",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.5-flash": "gemini-2.5-flash",
  cached: "cached",
};

export async function recordAIUsage(input: RecordUsageInput): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId: input.userId,
      feature: input.feature,
      model: MODEL_MAP[input.model] ?? "cached",
      tokensUsed: input.tokensUsed,
    });
  } catch (err) {
    // Never let usage tracking fail an AI request.
    console.warn("[ai] failed to record usage:", err);
  }
}
