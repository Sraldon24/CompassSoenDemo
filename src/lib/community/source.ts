/**
 * Common shape for any "what are students saying about X" source.
 *
 * Both Reddit (old.reddit.com/*.json) and Brave Search produce posts/results
 * with title + body + score + permalink. The scraper script doesn't care
 * which backend served them, only that they conform to this shape.
 */

export interface CommunityPost {
  /** Stable id — e.g. Reddit's `t3_xxx` or `brave-<hash>` for web results. */
  id: string;
  /** Course code this post was discovered under (e.g. "COMP 472"). */
  courseCode: string;
  /** Headline / page title. */
  title: string;
  /** Full body text. May be empty for link-only Reddit posts. */
  body: string;
  /** Author handle when known. `null` for anonymous web results. */
  author: string | null;
  /** Upvotes / engagement signal. `null` for non-Reddit sources. */
  score: number | null;
  /** Comment count. `null` for non-Reddit. */
  numComments: number | null;
  /** Canonical URL — what gets cited in summaries. */
  url: string;
  /** When the post was originally published. `null` if unknown. */
  postedAt: Date | null;
  /** Where this row came from — used for moderation + debugging. */
  source: "reddit" | "brave";
}

export interface CommunitySource {
  readonly name: "reddit" | "brave";
  /**
   * Returns up to `limit` posts about `courseCode`. Empty array = source
   * has nothing (vs. an error, which throws). Throwing tells the orchestrator
   * to fall back to the next source.
   */
  search(courseCode: string, limit?: number): Promise<CommunityPost[]>;
}
