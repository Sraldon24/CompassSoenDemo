/**
 * Consistent API response envelope.
 *
 * Every JSON API route returns the same shape so clients have ONE contract:
 *   success:  { success: true,  payload: <T>,   error: null }
 *   error:    { success: false, payload: null,  error: <message> }
 *
 * Notes / deliberate exclusions:
 *   - The streaming chat route (text/plain body + X-* headers) and the file
 *     download routes (ics/pdf/account-export) keep their raw bodies; only their
 *     ERROR responses use `apiError` so failures are uniform everywhere.
 *   - Error messages here are ALWAYS safe, static, client-facing strings — never
 *     a raw `err.message` (which can leak internals). Log the real error
 *     server-side; surface a label to the client.
 */

import { NextResponse } from "next/server";

export interface ApiSuccess<T> {
  success: true;
  payload: T;
  error: null;
}
export interface ApiFailure {
  success: false;
  payload: null;
  error: string;
}
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/** 2xx success envelope. Extra ResponseInit (e.g. headers) is merged. */
export function apiOk<T>(payload: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, payload, error: null } as const, {
    status: 200,
    ...init,
  });
}

/**
 * Non-2xx error envelope. `message` MUST be a safe, static client-facing string.
 * `extra` lets a route attach a few structured fields the client keys on
 * (e.g. `{ retryAfter }`, `{ code: "demo_limit" }`) without leaking internals;
 * keep these to known, intentional values.
 */
export function apiError(
  message: string,
  status: number,
  extra?: { headers?: HeadersInit; data?: Record<string, unknown> },
): NextResponse<ApiFailure & Record<string, unknown>> {
  return NextResponse.json(
    { success: false, payload: null, error: message, ...(extra?.data ?? {}) },
    { status, ...(extra?.headers ? { headers: extra.headers } : {}) },
  );
}
