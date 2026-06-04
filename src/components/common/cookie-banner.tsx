"use client";

/**
 * Cookie consent banner.
 *
 * Writes "cookie-consent" to localStorage:
 *   - "accepted" → analytics (PostHog) may initialize (see lib/analytics/client).
 *   - "rejected" → analytics stays off; only essential cookies (auth/session).
 *
 * Shows once, until a choice is made. Reloads on accept so the AnalyticsProvider
 * picks up consent on next mount (it reads the flag at init time).
 */

import { CONSENT_KEY } from "@/lib/analytics/is-allowed";
import Link from "next/link";
import { useEffect, useState } from "react";

export function CookieBanner(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if no choice recorded yet.
    const choice = window.localStorage.getItem(CONSENT_KEY);
    if (!choice) setVisible(true);
  }, []);

  if (!visible) return null;

  const choose = (value: "accepted" | "rejected") => {
    window.localStorage.setItem(CONSENT_KEY, value);
    setVisible(false);
    // On accept, reload so analytics initializes this session. On reject,
    // no reload needed — analytics simply never starts.
    if (value === "accepted") window.location.reload();
  };

  return (
    <section
      className="glass animate-rise fixed inset-x-3 bottom-3 z-50 rounded-2xl ring-hairline shadow-[var(--shadow-lg)] px-4 py-3"
      aria-label="Cookie consent"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm">
        <p className="flex-1" style={{ color: "var(--color-text-muted)" }}>
          We use essential cookies to keep you signed in. With your OK, we also use privacy-friendly
          analytics to improve Compass. See our{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="pressable rounded-lg ring-hairline px-3 py-1.5 transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ background: "var(--color-surface)" }}
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="pressable rounded-lg px-3 py-1.5 font-medium shadow-[var(--shadow-sm)]"
            style={{ background: "var(--gradient-accent)", color: "white" }}
          >
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}
