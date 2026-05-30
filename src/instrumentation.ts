/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Registers Sentry for the Node.js and Edge runtimes. The client runtime is
 * initialized separately in instrumentation-client.ts.
 *
 * Sentry is a no-op when NEXT_PUBLIC_SENTRY_DSN is unset, so local dev without
 * a DSN doesn't ship errors anywhere.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
