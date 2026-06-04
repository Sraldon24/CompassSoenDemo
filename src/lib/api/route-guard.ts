/**
 * Route guards for the community + account API routes.
 *
 * Collapses the repeated "getSession → 401 / guardAiCall → 429|503 / normalize
 * [code] → 400" preamble into a few named functions matching the exact shapes
 * the 6 routes need. Each returns a discriminated result:
 *   { ok: true, session, code? }  — proceed
 *   { ok: false, response }        — return this Response immediately
 *
 * CONTRACT NOTE: the community routes (community/difficulty/reviews/flag)
 * historically emit `{ error: "rate_limited", retryAfter: <sec> }` on 429 —
 * NOT the `denyResponse` "Rate limit reached." envelope used by the /ai/*
 * routes. We preserve that exact shape here so this is a pure internal dedup
 * with zero observable change. The /ai/* routes keep using `denyResponse`.
 */

import type { GroqModel } from "@/lib/ai/types";
import { getSession } from "@/lib/auth/get-session";
import {
  type Feature,
  type GuardDecision,
  type Identity,
  denyResponse,
  guardAiCall,
} from "@/lib/limits";
import type { z } from "zod";
import { normalizeCourseCode } from "./course-code";
import { apiError } from "./response";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Max JSON body size accepted by /ai/* routes (bytes). Chat is the largest
 * payload at ~2k chars; 64 KB is a generous ceiling that blocks abuse. */
const MAX_AI_BODY_BYTES = 64 * 1024;

export type GuardDenied = { ok: false; response: Response };
export type GuardOkAuth = { ok: true; session: Session; code: undefined };
export type GuardOkCourse = { ok: true; session: Session; code: string };

function unauthorized(): GuardDenied {
  return { ok: false, response: apiError("unauthorized", 401) };
}

function invalidCode(): GuardDenied {
  return { ok: false, response: apiError("invalid_course_code", 400) };
}

/** Community-flavored deny envelope, byte-identical to what these routes
 * already emit inline: `{ error: "rate_limited", retryAfter }` + Retry-After
 * header, 429 for BOTH rate-limit and quota denials (the original inline code
 * never distinguished denyReason, so neither do we). */
function communityDeny(decision: { retryAfterMs: number }): GuardDenied {
  const retryAfter = Math.ceil(decision.retryAfterMs / 1000);
  return {
    ok: false,
    response: apiError("rate_limited", 429, {
      headers: { "Retry-After": String(retryAfter) },
      data: { retryAfter },
    }),
  };
}

/** Auth-only (account/export, account/delete). */
export async function authGuard(): Promise<GuardDenied | GuardOkAuth> {
  const session = await getSession();
  if (!session) return unauthorized();
  return { ok: true, session, code: undefined };
}

/** Auth + rate-limit, no course code (moderation/flag). */
export async function authLimitGuard(feature: Feature): Promise<GuardDenied | GuardOkAuth> {
  const session = await getSession();
  if (!session) return unauthorized();
  const identity: Identity = { kind: "user", id: session.user.id };
  const decision = guardAiCall({ feature, identity });
  if (!decision.allowed) return communityDeny(decision);
  return { ok: true, session, code: undefined };
}

/** Auth + course code, no rate-limit (difficulty GET, reviews GET). */
export async function courseGuard(rawCode: string): Promise<GuardDenied | GuardOkCourse> {
  const session = await getSession();
  if (!session) return unauthorized();
  const code = normalizeCourseCode(rawCode);
  if (!code) return invalidCode();
  return { ok: true, session, code };
}

/** Auth → rate-limit → course code (community GET). Limit is checked BEFORE
 * code validation, matching that route's historical order. */
export async function courseLimitGuard(
  rawCode: string,
  feature: Feature,
): Promise<GuardDenied | GuardOkCourse> {
  const session = await getSession();
  if (!session) return unauthorized();
  const identity: Identity = { kind: "user", id: session.user.id };
  const decision = guardAiCall({ feature, identity });
  if (!decision.allowed) return communityDeny(decision);
  const code = normalizeCourseCode(rawCode);
  if (!code) return invalidCode();
  return { ok: true, session, code };
}

/** Auth → course code → rate-limit (difficulty POST, reviews POST). Code is
 * validated BEFORE the limit check, matching those routes' historical order:
 * a malformed code returns 400 even for a rate-limited user. */
export async function courseThenLimitGuard(
  rawCode: string,
  feature: Feature,
): Promise<GuardDenied | GuardOkCourse> {
  const session = await getSession();
  if (!session) return unauthorized();
  const code = normalizeCourseCode(rawCode);
  if (!code) return invalidCode();
  const identity: Identity = { kind: "user", id: session.user.id };
  const decision = guardAiCall({ feature, identity });
  if (!decision.allowed) return communityDeny(decision);
  return { ok: true, session, code };
}

// ── /ai/* routes ────────────────────────────────────────────────────────────
// The AI routes (chat/recommend/review/draft-email) share a different preamble
// than the community routes above: auth → parse+validate a JSON body (Zod) →
// rate-limit, and they use the `denyResponse` envelope ("Rate limit reached." /
// quota 503) — NOT the community `{error:"rate_limited"}` shape. aiGuard mirrors
// the route-guard discriminated-result style so routes stay flat + testable.

export type AiGuardOk<T> = { ok: true; session: Session; body: T; decision: GuardDecision };

/** Bad-request envelope used by /ai/* routes. */
function badRequest(message: string): GuardDenied {
  return { ok: false, response: apiError(message, 400) };
}

/**
 * /ai/* preamble: session → 401, then parse+validate the JSON body against
 * `schema` → 400, then rate-limit/quota guard → denyResponse (429/503).
 * Returns the validated body + the (allowed) decision so the route can read
 * `decision.remaining` etc. Pass `model` so the quota check targets the model
 * the route will actually call.
 */
export async function aiGuard<T>(
  req: Request,
  schema: z.ZodType<T>,
  feature: Feature,
  model?: GroqModel,
): Promise<GuardDenied | AiGuardOk<T>> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: apiError("unauthorized", 401) };
  }

  // Reject oversized bodies before parsing them into memory. All /ai/* payloads
  // are small (the largest field is a ~2k-char chat message), so 64 KB is a
  // generous ceiling that still blocks abuse.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_AI_BODY_BYTES) {
    return { ok: false, response: apiError("Request body too large", 413) };
  }

  let body: T;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const zerr = err as { issues?: Array<{ message?: string }> };
    return badRequest(zerr?.issues?.[0]?.message ?? "Bad request");
  }

  const decision = guardAiCall({
    feature,
    identity: { kind: "user", id: session.user.id },
    ...(model ? { model } : {}),
  });
  if (!decision.allowed) return { ok: false, response: denyResponse(decision) };

  return { ok: true, session, body, decision };
}
