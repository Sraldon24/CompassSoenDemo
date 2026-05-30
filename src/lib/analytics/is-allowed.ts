/**
 * Pure analytics-consent decision + the shared consent storage key.
 *
 * The decision was previously inlined inside the AnalyticsProvider client
 * component (reading three browser globals at once), so it couldn't be tested.
 * Extracted here as a pure function over an explicit inputs object. The client
 * collects the globals; this decides.
 */

/** localStorage key the cookie banner writes and the analytics gate reads.
 * Single source of truth — previously duplicated as a literal in two files. */
export const CONSENT_KEY = "cookie-consent";

export interface AnalyticsAllowedInput {
  /** Whether NEXT_PUBLIC_POSTHOG_KEY is configured. */
  hasKey: boolean;
  /** navigator.doNotTrack value, or null in SSR. */
  doNotTrack: string | null;
  /** localStorage consent value ("accepted" | "rejected" | null). */
  consent: string | null;
}

/**
 * Analytics is allowed only when: a key is configured AND Do-Not-Track is not
 * "1" AND the user explicitly accepted analytics cookies. Pure + total.
 */
export function isAnalyticsAllowed(input: AnalyticsAllowedInput): boolean {
  if (!input.hasKey) return false;
  if (input.doNotTrack === "1") return false;
  return input.consent === "accepted";
}
