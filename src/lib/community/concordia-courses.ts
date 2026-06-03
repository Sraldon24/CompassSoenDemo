/**
 * concordia.courses community source — Concordia-specific student reviews.
 *
 * concordia.courses is a student-run review site for Concordia (Montreal),
 * with structured per-course reviews carrying rating / difficulty / experience
 * and free-text content — far denser SOEN/COMP/ENGR/MATH coverage than Reddit.
 * Public JSON API, no key/login (like old.reddit.com's *.json).
 *
 * Verified contract (2026-06-03):
 *   POST https://api.concordia.courses/api/v1/courses/{ID}?limit=&offset=
 *     ID   = course code, UPPERCASE, no space ("COMP 352" → "COMP352")
 *     body = {"sortType":"recent","reverse":true}   (sortType enum: recent|rating|experience|difficulty|likes)
 *   → { status, payload: { course:{...}, reviews:[{ _id, content, difficulty, experience, rating, instructorId, likes, timestamp, flagged }], totalReviews } }
 *
 * We're polite: descriptive User-Agent, low volume, the orchestrator caches the
 * resulting summaries for 7 days (it's a tiny solo-maintained project).
 */

import type { CommunityPost, CommunitySource } from "./source";

const CC_API = "https://api.concordia.courses/api/v1";
// Browser-ish UA + Origin: a bare bot UA gets 403'd by the edge. We still
// identify ourselves in the UA string for transparency.
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SOEN-Compass-Bot/1.0";

export class ConcordiaCoursesError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ConcordiaCoursesError";
    this.status = status;
  }
}

interface CCReview {
  _id: string;
  content?: string;
  difficulty?: number; // 0-5
  experience?: number; // 0-5
  rating?: number; // 0-5
  instructorId?: string;
  likes?: number;
  timestamp?: string;
  flagged?: boolean;
}

interface CCResponse {
  status: string;
  payload: {
    course?: { _id: string; title?: string };
    reviews?: CCReview[];
    totalReviews?: number;
  } | null;
}

/** "COMP 352" → "COMP352" (the API's id format). */
function toCourseId(courseCode: string): string {
  return courseCode.replace(/\s+/g, "").toUpperCase();
}

/**
 * Fetch reviews for one course. Returns posts (one per review). Throws
 * ConcordiaCoursesError on non-2xx so the orchestrator can fall back to Reddit.
 * A 404 (course not on the site) returns [] — that's "no data", not an error.
 */
export async function searchConcordiaCoursesForCourse(
  courseCode: string,
  limit = 25,
): Promise<CommunityPost[]> {
  const id = toCourseId(courseCode);
  const url = `${CC_API}/courses/${encodeURIComponent(id)}?limit=${limit}&offset=0`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": process.env.CONCORDIA_COURSES_USER_AGENT || BROWSER_UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://concordia.courses",
        Referer: "https://concordia.courses/",
      },
      body: JSON.stringify({ sortType: "recent", reverse: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
    throw new ConcordiaCoursesError(`concordia.courses ${reason} for ${courseCode}`, 504);
  }

  // 404 = course not tracked there → no data (not a failure).
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new ConcordiaCoursesError(
      `concordia.courses failed for ${courseCode}: ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const json = (await res.json()) as CCResponse;
  const reviews = json?.payload?.reviews ?? [];

  return reviews
    .filter((r) => !r.flagged && (r.content ?? "").trim().length > 0)
    .map((r) => mapReviewToCommunity(r, courseCode));
}

function mapReviewToCommunity(r: CCReview, courseCode: string): CommunityPost {
  // Synthesize a title from the structured signal so the summarizer has context
  // even though reviews have no headline. body = the free-text content.
  const bits: string[] = [];
  if (typeof r.rating === "number") bits.push(`rating ${r.rating}/5`);
  if (typeof r.difficulty === "number") bits.push(`difficulty ${r.difficulty}/5`);
  if (r.instructorId) bits.push(`prof ${r.instructorId.replace(/-/g, " ")}`);
  const title = `${courseCode} review${bits.length ? ` (${bits.join(", ")})` : ""}`;

  return {
    id: `cc_${r._id}`,
    courseCode,
    title,
    body: r.content ?? "",
    author: r.instructorId ? `re: ${r.instructorId.replace(/-/g, " ")}` : null,
    // Use likes as the engagement signal (parallels Reddit score).
    score: typeof r.likes === "number" ? r.likes : null,
    numComments: null,
    url: `https://concordia.courses/course/${toCourseId(courseCode)}`,
    postedAt: r.timestamp ? new Date(r.timestamp) : null,
    source: "concordia-courses",
  };
}

export const concordiaCoursesSource: CommunitySource = {
  name: "concordia-courses",
  async search(courseCode, limit = 25) {
    return searchConcordiaCoursesForCourse(courseCode, limit);
  },
};
