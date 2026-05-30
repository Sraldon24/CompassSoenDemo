import { _resetGroqQuotaForTesting, recordGroqUsage } from "@/lib/ai/groq-quota";
import type { LlmProvider } from "@/lib/ai/llm-port";
import {
  AIError,
  _resetFallbackProviderForTesting,
  _resetLlmProviderForTesting,
  _setFallbackProviderForTesting,
  _setLlmProviderForTesting,
  generateResponse,
  selectModel,
} from "@/lib/ai/provider";
import { makeFakeProvider } from "@/lib/ai/providers/fake-provider";
import { afterEach, describe, expect, it } from "vitest";

/** A fallback that always fails — so Groq-exhaustion tests see the final error
 * surface rather than a fallback rescue. */
const failingFallback: LlmProvider = {
  async generate() {
    const err = new Error("fallback down") as Error & { status: number };
    err.status = 503;
    throw err;
  },
};

afterEach(() => {
  _resetLlmProviderForTesting();
  _resetFallbackProviderForTesting();
  _resetGroqQuotaForTesting();
});

describe("selectModel routing", () => {
  it("routes simple/search tasks to the 8B model", () => {
    expect(selectModel("chat-simple")).toBe("llama-3.1-8b-instant");
    expect(selectModel("search")).toBe("llama-3.1-8b-instant");
  });
  it("routes complex tasks to the 70B model", () => {
    expect(selectModel("recommend")).toBe("llama-3.3-70b-versatile");
    expect(selectModel("email-draft")).toBe("llama-3.3-70b-versatile");
  });
});

describe("generateResponse retry/backoff (fake provider, no API key)", () => {
  it("retries once on 429 then succeeds, honoring Retry-After", async () => {
    const fake = makeFakeProvider({ throwStatuses: [429], retryAfterSec: 0.01, text: "pong" });
    _setLlmProviderForTesting(fake);
    const r = await generateResponse({
      task: "chat-simple",
      system: "s",
      messages: [{ role: "user", content: "ping" }],
      maxAttempts: 3,
    });
    expect(fake.calls).toBe(2); // first 429, retry succeeds
    expect(r.text).toBe("pong");
    expect(r.servedBy).toBe("groq");
  });

  it("exhausts Groq retries on persistent 429, then (fallback down) → AIError 429", async () => {
    // chat-simple is an 8B task → no 70B→8B downgrade, single Groq model.
    _setLlmProviderForTesting(
      makeFakeProvider({ throwStatuses: [429, 429, 429], retryAfterSec: 0.01 }),
    );
    _setFallbackProviderForTesting(failingFallback);
    await expect(
      generateResponse({ task: "chat-simple", system: "s", messages: [], maxAttempts: 3 }),
    ).rejects.toMatchObject({ name: "AIError", status: 429 });
  });

  it("maps a 500 to a 503 AIError after retries (fallback down)", async () => {
    _setLlmProviderForTesting(makeFakeProvider({ throwStatuses: [500, 500] }));
    _setFallbackProviderForTesting(failingFallback);
    await expect(
      generateResponse({ task: "chat-simple", system: "s", messages: [], maxAttempts: 2 }),
    ).rejects.toMatchObject({ name: "AIError", status: 503 });
  });

  it("does not retry a non-retryable error (400)", async () => {
    const fake = makeFakeProvider({ throwStatuses: [400, 400, 400] });
    _setLlmProviderForTesting(fake);
    _setFallbackProviderForTesting(failingFallback);
    await expect(
      generateResponse({ task: "chat-simple", system: "s", messages: [], maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(AIError);
    expect(fake.calls).toBe(1); // stopped immediately (no retry, no downgrade)
  });
});

describe("fallback chain (task #101)", () => {
  it("falls back to OpenRouter when Groq exhausts on 429", async () => {
    _setLlmProviderForTesting(
      makeFakeProvider({ throwStatuses: [429, 429, 429], retryAfterSec: 0.01 }),
    );
    const fallback = makeFakeProvider({ text: "from-openrouter" });
    _setFallbackProviderForTesting(fallback);

    const r = await generateResponse({
      task: "chat-simple",
      system: "s",
      messages: [],
      maxAttempts: 3,
    });
    expect(r.text).toBe("from-openrouter");
    expect(r.servedBy).toBe("openrouter");
    expect(fallback.calls).toBe(1);
  });

  it("downgrades 70B → 8B on Groq before falling back", async () => {
    // 70B task. First Groq model (70B) fails 429 thrice, second (8B) succeeds.
    // The fake throws for the first 3 calls then returns text on the 4th.
    const fake = makeFakeProvider({
      throwStatuses: [429, 429, 429],
      retryAfterSec: 0.01,
      text: "ok-8b",
    });
    _setLlmProviderForTesting(fake);
    _setFallbackProviderForTesting(failingFallback);

    const r = await generateResponse({
      task: "recommend", // 70B
      system: "s",
      messages: [],
      maxAttempts: 3,
    });
    // 3 failed calls on 70B + 1 success on 8B (4th call) = served by Groq, model 8B.
    expect(r.servedBy).toBe("groq");
    expect(r.model).toBe("llama-3.1-8b-instant");
    expect(fake.calls).toBe(4);
  });

  it("does NOT fall back on a non-retryable Groq error", async () => {
    _setLlmProviderForTesting(makeFakeProvider({ throwStatuses: [400] }));
    const fallback = makeFakeProvider({ text: "should-not-run" });
    _setFallbackProviderForTesting(fallback);
    await expect(
      generateResponse({ task: "chat-simple", system: "s", messages: [], maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(AIError);
    expect(fallback.calls).toBe(0); // 400 is the user's fault — no point falling back
  });
});

describe("circuit breaker (quota ≥85%)", () => {
  it("skips Groq and uses the fallback when daily quota is exhausted", async () => {
    // 8B model: 14,400 RPD. Push to 85% (12,240) so the breaker trips.
    for (let i = 0; i < 12_300; i++) recordGroqUsage("llama-3.1-8b-instant", 0);
    const groqFake = makeFakeProvider({ text: "should-not-run" });
    _setLlmProviderForTesting(groqFake);
    const fallback = makeFakeProvider({ text: "fallback-served" });
    _setFallbackProviderForTesting(fallback);

    const r = await generateResponse({
      task: "chat-simple",
      system: "s",
      messages: [],
      maxAttempts: 3,
    });
    expect(groqFake.calls).toBe(0); // Groq skipped entirely when throttled
    expect(r.servedBy).toBe("openrouter");
    expect(r.text).toBe("fallback-served");
  });

  it("throws 503 when quota exhausted AND fallback is unavailable", async () => {
    for (let i = 0; i < 12_300; i++) recordGroqUsage("llama-3.1-8b-instant", 0);
    _setLlmProviderForTesting(makeFakeProvider({ text: "should-not-run" }));
    _setFallbackProviderForTesting(failingFallback);
    await expect(
      generateResponse({ task: "chat-simple", system: "s", messages: [], maxAttempts: 3 }),
    ).rejects.toMatchObject({ name: "AIError", status: 503 });
  });
});
