/**
 * Reddit community source — primary backend.
 *
 * Hits old.reddit.com/r/Concordia/search.json which is JSON-by-default,
 * unauthenticated, and unmetered (Reddit asks for a descriptive User-Agent
 * and not much else). When this returns 0 results, the orchestrator falls
 * back to Brave Search.
 *
 * We use `old.reddit.com` deliberately — `www.reddit.com` started forcing
 * OAuth on `*.json` endpoints in 2023, but the old subdomain still serves
 * the legacy JSON freely.
 */

import type { CommunityPost, CommunitySource } from "./source";

const REDDIT_BASE = "https://old.reddit.com";
const DEFAULT_UA = "SOEN-Compass-Bot/1.0 (https://github.com/Sraldon24/CompassSoenDemo)";

interface RedditListingChild {
  kind: string;
  data: {
    id: string;
    name: string;
    title: string;
    selftext: string;
    author: string;
    score: number;
    num_comments: number;
    permalink: string;
    created_utc: number;
    is_self: boolean;
  };
}

interface RedditListingResponse {
  kind: string;
  data: {
    children: RedditListingChild[];
  };
}

export class RedditSearchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RedditSearchError";
    this.status = status;
  }
}

/**
 * Search r/Concordia for a course code. Returns posts ordered by relevance.
 * Throws RedditSearchError on non-2xx — orchestrator should fall back.
 */
export async function searchRedditForCourse(
  courseCode: string,
  limit = 25,
): Promise<CommunityPost[]> {
  const query = encodeURIComponent(`"${courseCode}"`);
  const url = `${REDDIT_BASE}/r/Concordia/search.json?q=${query}&restrict_sr=on&limit=${limit}&sort=relevance&t=all`;

  const userAgent = process.env.REDDIT_USER_AGENT || DEFAULT_UA;
  // Hard timeout — old.reddit.com occasionally holds a connection open with no
  // response, which would otherwise wedge the whole weekly scrape. A timeout
  // surfaces as a RedditSearchError so the orchestrator falls back to Brave.
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
    throw new RedditSearchError(`Reddit search ${reason} for ${courseCode}`, 504);
  }

  if (!res.ok) {
    throw new RedditSearchError(
      `Reddit search failed for ${courseCode}: ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const json = (await res.json()) as RedditListingResponse;
  const children = json?.data?.children ?? [];

  return children
    .filter((c) => c.kind === "t3")
    .map((c) => mapRedditPostToCommunity(c.data, courseCode));
}

function mapRedditPostToCommunity(
  data: RedditListingChild["data"],
  courseCode: string,
): CommunityPost {
  return {
    id: data.name, // already `t3_xxx`, the fullname
    courseCode,
    title: data.title,
    body: data.selftext ?? "",
    author: data.author ?? null,
    score: typeof data.score === "number" ? data.score : null,
    numComments: typeof data.num_comments === "number" ? data.num_comments : null,
    url: `https://www.reddit.com${data.permalink}`,
    postedAt: data.created_utc ? new Date(data.created_utc * 1000) : null,
    source: "reddit",
  };
}

export const redditSource: CommunitySource = {
  name: "reddit",
  async search(courseCode, limit = 25) {
    return searchRedditForCourse(courseCode, limit);
  },
};
