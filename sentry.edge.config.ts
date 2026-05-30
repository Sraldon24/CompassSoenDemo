/**
 * Sentry — Edge runtime init (middleware, edge routes).
 * No-op when NEXT_PUBLIC_SENTRY_DSN is unset.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    enabled: process.env.NODE_ENV === "production",
    environment: process.env.NODE_ENV,
  });
}
