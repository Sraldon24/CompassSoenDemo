/**
 * AI usage tracking — separate from rate-limit cache so we have an audit trail
 * even if the in-memory limiter is reset (e.g. server restart).
 */

import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";
import type { GroqModel } from "./types";

interface RecordUsageInput {
  userId: string;
  feature: string;
  model: GroqModel | "cached";
  tokensUsed: number;
}

const MODEL_MAP: Record<string, "groq-llama-3.1-8b" | "groq-llama-3.3-70b" | "cached"> = {
  "llama-3.1-8b-instant": "groq-llama-3.1-8b",
  "llama-3.3-70b-versatile": "groq-llama-3.3-70b",
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
