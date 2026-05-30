"use client";

/**
 * App Router global error boundary. Reports the error to Sentry, then renders
 * a minimal fallback. Only catches errors that bubble past nested error
 * boundaries (i.e. errors in the root layout).
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#666", fontSize: 14 }}>
            We hit an unexpected error and our team has been notified. Try refreshing the page.
          </p>
        </div>
      </body>
    </html>
  );
}
