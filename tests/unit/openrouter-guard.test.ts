/**
 * Tests for the OpenRouter never-spend guards (memory: project-openrouter-never-spend).
 *
 * Guard #1 (allowlist) is pure + unit-testable. Guard #2 (pre-flight balance)
 * uses a mocked fetch. We must PROVE a non-free model is rejected before any
 * HTTP call — that's the line between $0 and a bill.
 */

import {
  OPENROUTER_FREE_MODELS,
  OpenRouterDisabledError,
  _resetOpenRouterBalanceForTesting,
  assertFreeModel,
  isOpenRouterSpendSafe,
} from "@/lib/ai/providers/openrouter-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("assertFreeModel (guard #1 — allowlist)", () => {
  it("accepts every model in the pre-vetted free list", () => {
    for (const m of OPENROUTER_FREE_MODELS) {
      expect(() => assertFreeModel(m)).not.toThrow();
      expect(m.endsWith(":free")).toBe(true);
    }
  });

  it("rejects any model id that does not end in :free", () => {
    expect(() => assertFreeModel("openai/gpt-4o")).toThrow(OpenRouterDisabledError);
    expect(() => assertFreeModel("anthropic/claude-3.5-sonnet")).toThrow(OpenRouterDisabledError);
    expect(() => assertFreeModel("meta-llama/llama-3.3-70b-instruct")).toThrow(
      OpenRouterDisabledError,
    );
  });

  it("rejects a sneaky near-miss (':free' not at the end)", () => {
    expect(() => assertFreeModel("evil/:free-but-paid")).toThrow(OpenRouterDisabledError);
  });
});

describe("isOpenRouterSpendSafe (guard #2 — pre-flight balance)", () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    _resetOpenRouterBalanceForTesting();
    process.env.OPENROUTER_API_KEY = "sk-or-test";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    _resetOpenRouterBalanceForTesting();
    process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
  });

  it("returns false when no API key is set", async () => {
    process.env.OPENROUTER_API_KEY = "";
    expect(await isOpenRouterSpendSafe()).toBe(false);
  });

  it("returns true when key usage is exactly $0", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { usage: 0 } }),
    }) as unknown as typeof fetch;
    expect(await isOpenRouterSpendSafe()).toBe(true);
  });

  it("returns FALSE when usage > 0 (protect the credit)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { usage: 0.01 } }),
    }) as unknown as typeof fetch;
    expect(await isOpenRouterSpendSafe()).toBe(false);
  });

  it("returns false when the balance endpoint errors", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await isOpenRouterSpendSafe()).toBe(false);
  });

  it("memoizes — only hits /auth/key once per process", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { usage: 0 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await isOpenRouterSpendSafe();
    await isOpenRouterSpendSafe();
    await isOpenRouterSpendSafe();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
