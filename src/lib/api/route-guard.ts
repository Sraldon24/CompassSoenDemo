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

import { getSession } from "@/lib/get-session";
import { type Feature, type Identity, guardAiCall } from "@/lib/limits";
import { NextResponse } from "next/server";
import { normalizeCourseCode } from "./course-code";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type GuardDenied = { ok: false; response: Response };
export type GuardOkAuth = { ok: true; session: Session; code: undefined };
export type GuardOkCourse = { ok: true; session: Session; code: string };

function unauthorized(): GuardDenied {
  return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
}

function invalidCode(): GuardDenied {
  return {
    ok: false,
    response: NextResponse.json({ error: "invalid_course_code" }, { status: 400 }),
  };
}

/** Community-flavored deny envelope, byte-identical to what these routes
 * already emit inline: `{ error: "rate_limited", retryAfter }` + Retry-After
 * header, 429 for BOTH rate-limit and quota denials (the original inline code
 * never distinguished denyReason, so neither do we). */
function communityDeny(decision: { retryAfterMs: number }): GuardDenied {
  const retryAfter = Math.ceil(decision.retryAfterMs / 1000);
  return {
    ok: false,
    response: NextResponse.json(
      { error: "rate_limited", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    ),
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
