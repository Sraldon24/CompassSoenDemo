/**
 * Unit tests for the pure analytics-consent gate. No browser, no PostHog.
 * Covers both the client init/track gate and the server no-op path (hasKey=false).
 */

import { isAnalyticsAllowed } from "@/lib/analytics/is-allowed";
import { describe, expect, it } from "vitest";

const base = { hasKey: true, doNotTrack: null, consent: "accepted" } as const;

describe("isAnalyticsAllowed", () => {
  it("allows when key present, DNT off, consent accepted", () => {
    expect(isAnalyticsAllowed(base)).toBe(true);
  });

  it("blocks when no PostHog key (also covers the server no-op path)", () => {
    expect(isAnalyticsAllowed({ ...base, hasKey: false })).toBe(false);
  });

  it("blocks when Do-Not-Track is '1'", () => {
    expect(isAnalyticsAllowed({ ...base, doNotTrack: "1" })).toBe(false);
  });

  it("blocks when consent rejected", () => {
    expect(isAnalyticsAllowed({ ...base, consent: "rejected" })).toBe(false);
  });

  it("blocks when no consent choice made yet (null)", () => {
    expect(isAnalyticsAllowed({ ...base, consent: null })).toBe(false);
  });

  it("blocks in an SSR-like context (no key, no globals)", () => {
    expect(isAnalyticsAllowed({ hasKey: false, doNotTrack: null, consent: null })).toBe(false);
  });

  it("treats DNT values other than '1' as not-set", () => {
    // Some browsers send "unspecified" or "0" — only "1" means opt out.
    expect(isAnalyticsAllowed({ ...base, doNotTrack: "0" })).toBe(true);
    expect(isAnalyticsAllowed({ ...base, doNotTrack: "unspecified" })).toBe(true);
  });
});
