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
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#f7f8f8",
          margin: 0,
          color: "#1a1d1f",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 440,
            padding: "40px 32px",
            margin: 16,
            borderRadius: 20,
            background: "#ffffff",
            boxShadow:
              "0 1px 2px rgba(20,22,26,0.06), 0 2px 4px rgba(20,22,26,0.04), 0 10px 30px rgba(20,22,26,0.07)",
            border: "1px solid rgba(20,22,26,0.06)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 14,
              marginBottom: 20,
              background: "linear-gradient(135deg, #d9f2e6, #d4f0ee)",
              color: "#2f7d5b",
              fontSize: 24,
              lineHeight: 1,
            }}
            aria-hidden
          >
            ⚠
          </div>
          <h1
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 8px" }}
          >
            Something went wrong
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            We hit an unexpected error and our team has been notified. Try refreshing the page.
          </p>
        </div>
      </body>
    </html>
  );
}
