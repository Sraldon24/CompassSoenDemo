/**
 * The 12 launch analytics events — single source of truth.
 *
 * Both the client tracker (posthog-js) and the server tracker (posthog-node)
 * import this so event names never drift between front and back end. Adding an
 * event means adding it here first; call sites are then type-checked against
 * the union.
 */

export const ANALYTICS_EVENTS = {
  signup: "signup",
  onboarding_completed: "onboarding_completed",
  plan_created: "plan_created",
  course_added: "course_added",
  course_removed: "course_removed",
  term_changed: "term_changed",
  ai_chat_sent: "ai_chat_sent",
  ai_recommend_clicked: "ai_recommend_clicked",
  email_drafted: "email_drafted",
  export_pdf: "export_pdf",
  export_ics: "export_ics",
  public_profile_view: "public_profile_view",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Loosely-typed properties bag — PostHog accepts any JSON-serializable map. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
