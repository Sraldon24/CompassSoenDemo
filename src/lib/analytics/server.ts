/**
 * Server-side analytics via posthog-node.
 *
 * No-op when NEXT_PUBLIC_POSTHOG_KEY is unset (local dev). Server events are
 * captured for things that happen without a client round-trip (signup callback,
 * AI usage recorded in route handlers, exports).
 *
 * We lazily construct a single PostHog client and flush on each capture —
 * serverless functions are short-lived, so we can't rely on a background flush.
 */

import { PostHog } from "posthog-node";
import type { AnalyticsEvent, AnalyticsProps } from "./events";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1, // capture-and-send immediately in serverless
      flushInterval: 0,
    });
  }
  return client;
}

/**
 * Capture a server-side event for a known user. Safe to call unconditionally —
 * no-ops when PostHog isn't configured. Awaits the flush so the event isn't
 * lost when the serverless function freezes.
 */
export async function trackServer(
  distinctId: string,
  event: AnalyticsEvent,
  props?: AnalyticsProps,
): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties: props });
    await ph.flush();
  } catch (err) {
    // Analytics must never break the request path.
    console.warn(`[analytics] server capture failed for ${event}:`, err);
  }
}

/** Associate a user's metadata. Call on signup / onboarding completion. */
export async function identifyServer(distinctId: string, props?: AnalyticsProps): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.identify({ distinctId, properties: props });
    await ph.flush();
  } catch (err) {
    console.warn("[analytics] server identify failed:", err);
  }
}
