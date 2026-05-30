/**
 * Guards the analytics event registry — the 12 launch events must stay
 * present and stable, since dashboards + funnels in PostHog key off these
 * exact names. Renaming one silently breaks a saved insight.
 */

import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { describe, expect, it } from "vitest";

describe("ANALYTICS_EVENTS registry", () => {
  it("contains exactly the 12 launch events", () => {
    expect(Object.keys(ANALYTICS_EVENTS).sort()).toEqual(
      [
        "ai_chat_sent",
        "ai_recommend_clicked",
        "course_added",
        "course_removed",
        "email_drafted",
        "export_ics",
        "export_pdf",
        "onboarding_completed",
        "plan_created",
        "public_profile_view",
        "signup",
        "term_changed",
      ].sort(),
    );
  });

  it("maps every key to a string value equal to its key (no drift)", () => {
    for (const [key, value] of Object.entries(ANALYTICS_EVENTS)) {
      expect(value).toBe(key);
    }
  });
});
