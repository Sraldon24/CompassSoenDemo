/**
 * Sentry — browser/client runtime init. Next 16 auto-loads this file.
 * No-op when NEXT_PUBLIC_SENTRY_DSN is unset.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    enabled: process.env.NODE_ENV === "production",
    environment: process.env.NODE_ENV,
    // Session replay is opt-in later; keep the initial bundle lean for now.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
