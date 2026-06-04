/**
 * Groq provider — the real, production adapter for the non-streaming path.
 *
 * This is the only module (besides the streaming call in `provider.ts`) that
 * imports `@ai-sdk/groq`. It does a single round-trip with `maxRetries: 0` —
 * `provider.ts` owns retry/backoff/quota around it.
 */

import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import type { LlmCallInput, LlmGenerateResult, LlmProvider } from "../llm-port";

export const groqProvider: LlmProvider = {
  async generate(input: LlmCallInput): Promise<LlmGenerateResult> {
    const result = await generateText({
      model: groq(input.model),
      system: input.system,
      messages: input.messages,
      temperature: input.temperature ?? 0.4,
      // Honor the caller's output cap (recommend/email/review/summarize set this).
      // Previously dropped here → every Groq completion ran uncapped.
      ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
      maxRetries: 0, // provider.ts handles retries
    });
    return { text: result.text, usage: { tokens: result.usage?.totalTokens ?? 0 } };
  },
};
