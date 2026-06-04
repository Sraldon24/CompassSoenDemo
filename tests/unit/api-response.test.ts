/**
 * Unit tests for the unified API response envelope ({ success, payload, error }).
 * Locks in the contract every JSON route now depends on.
 */

import { apiError, apiOk } from "@/lib/api/response";
import { describe, expect, it } from "vitest";

describe("apiOk", () => {
  it("wraps the payload in a success envelope at status 200", async () => {
    const res = apiOk({ recommendations: [1, 2, 3] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      payload: { recommendations: [1, 2, 3] },
      error: null,
    });
  });

  it("merges extra ResponseInit (e.g. headers)", () => {
    const res = apiOk({ ok: 1 }, { headers: { "X-Test": "1" } });
    expect(res.headers.get("X-Test")).toBe("1");
    expect(res.status).toBe(200);
  });
});

describe("apiError", () => {
  it("produces a failure envelope with the given message + status", async () => {
    const res = apiError("unauthorized", 401);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, payload: null, error: "unauthorized" });
  });

  it("merges extra top-level data fields (e.g. retryAfter, code)", async () => {
    const res = apiError("rate_limited", 429, {
      headers: { "Retry-After": "30" },
      data: { retryAfter: 30 },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toEqual({
      success: false,
      payload: null,
      error: "rate_limited",
      retryAfter: 30,
    });
  });

  it("keeps a known error code as the top-level error string (client branches on it)", async () => {
    const res = apiError("demo_limit", 429);
    expect((await res.json()).error).toBe("demo_limit");
  });
});
