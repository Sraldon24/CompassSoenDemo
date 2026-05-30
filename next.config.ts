import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Org + project are derived from the Sentry DSN
// (o4511463270055936 → org id, 4511463273201664 → project id).
// Source maps upload only happens when SENTRY_AUTH_TOKEN is present (CI/prod),
// so local builds without the token are unaffected.
export default withSentryConfig(nextConfig, {
  org: "o4511463270055936",
  project: "soen-compass",
  // Quiet the build logs unless explicitly debugging.
  silent: !process.env.CI,
  // Upload source maps for better stack traces, then hide them from the
  // client bundle so we don't ship source to users.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Route browser Sentry requests through a Next rewrite to dodge ad-blockers.
  tunnelRoute: "/monitoring",
});
