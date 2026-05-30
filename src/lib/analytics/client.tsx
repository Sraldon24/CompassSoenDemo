"use client";

/**
 * Client-side analytics via posthog-js.
 *
 * Privacy-first:
 *   - No-op when NEXT_PUBLIC_POSTHOG_KEY is unset.
 *   - Respects the browser Do-Not-Track header.
 *   - Only initializes after the user has accepted analytics cookies
 *     (localStorage "cookie-consent" === "accepted"), set by the cookie
 *     banner (#93). Until then, posthog stays uninitialized.
 *
 * Components call useTrack() to get a typed track(event, props) function.
 */

import posthog from "posthog-js";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { ANALYTICS_EVENTS, type AnalyticsEvent, type AnalyticsProps } from "./events";
import { CONSENT_KEY, isAnalyticsAllowed } from "./is-allowed";

type TrackFn = (event: AnalyticsEvent, props?: AnalyticsProps) => void;

const TrackContext = createContext<TrackFn>(() => {});

/** Impure collector: gathers the browser globals, then defers the decision to
 * the pure isAnalyticsAllowed() (unit-tested in analytics-allowed.test.ts). */
function analyticsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const dnt = navigator.doNotTrack ?? (window as { doNotTrack?: string }).doNotTrack ?? null;
  return isAnalyticsAllowed({
    hasKey: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    doNotTrack: dnt,
    consent: window.localStorage.getItem(CONSENT_KEY),
  });
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !analyticsAllowed()) return;
    initialized.current = true;
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // explicit events only — keeps the event stream clean
      persistence: "localStorage",
    });
  }, []);

  const track = useCallback<TrackFn>((event, props) => {
    if (!analyticsAllowed()) return;
    posthog.capture(event, props);
  }, []);

  return <TrackContext.Provider value={track}>{children}</TrackContext.Provider>;
}

export function useTrack(): TrackFn {
  return useContext(TrackContext);
}

/** Re-export so call sites can reference event names without a second import. */
export { ANALYTICS_EVENTS };
