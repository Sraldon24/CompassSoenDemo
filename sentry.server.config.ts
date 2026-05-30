/**
 * Sentry — Node.js server runtime init.
 *
 * No-op when NEXT_PUBLIC_SENTRY_DSN is unset (local dev). tracesSampleRate is
 * driven by env so we can dial it down in prod without a redeploy.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    // Don't spam Sentry from local dev.
    enabled: process.env.NODE_ENV === "production",
    environment: process.env.NODE_ENV,
  });
}
