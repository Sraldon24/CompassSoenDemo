/**
 * Fake LLM provider for tests — no network, no API key.
 *
 * Programmable: hand it a list of HTTP statuses to throw (in order) before
 * succeeding, so tests can drive 429→retry→success and exhaustion scenarios.
 * Errors are shaped exactly like Groq's (`status` + `headers["retry-after"]`)
 * so the REAL `isRetryable` / `retryAfterMsFromError` / `statusOf` helpers in
 * `provider.ts` run unchanged — we test production logic, not a parallel path.
 */

import type { LlmProvider } from "../llm-port";

export interface FakeProviderOptions {
  /** Text returned on a successful call. Defaults to "ok". */
  text?: string;
  /** Statuses to throw (in order) before succeeding, e.g. [429, 429]. */
  throwStatuses?: number[];
  /** Seconds for a Groq-shaped `retry-after` header on thrown errors. */
  retryAfterSec?: number;
  /** Tokens reported on success. Defaults to 10. */
  tokens?: number;
}

export interface FakeProvider extends LlmProvider {
  /** Number of times `generate` was invoked. */
  readonly calls: number;
}

export function makeFakeProvider(opts: FakeProviderOptions = {}): FakeProvider {
  let calls = 0;
  let thrown = 0;
  const state = {
    get calls() {
      return calls;
    },
    async generate() {
      calls++;
      const status = opts.throwStatuses?.[thrown];
      if (status !== undefined) {
        thrown++;
        throw Object.assign(new Error(`fake ${status}`), {
          status,
          headers: opts.retryAfterSec
            ? { "retry-after": String(opts.retryAfterSec) }
            : ({} as Record<string, string>),
        });
      }
      return { text: opts.text ?? "ok", usage: { tokens: opts.tokens ?? 10 } };
    },
  };
  return state;
}
