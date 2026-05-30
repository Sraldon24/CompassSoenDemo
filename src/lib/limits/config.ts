/**
 * Standard limits — single source of truth for UI counters + enforcement.
 * Keyed by logical feature. Windows in milliseconds.
 */
export const LIMITS = {
  aiChat: { limit: 50, windowMs: 24 * 60 * 60 * 1000 },
  aiRecommend: { limit: 20, windowMs: 24 * 60 * 60 * 1000 },
  aiDraftEmail: { limit: 30, windowMs: 24 * 60 * 60 * 1000 },
  courseCommunity: { limit: 60, windowMs: 60 * 60 * 1000 },
  search: { limit: 100, windowMs: 60 * 60 * 1000 },
  import: { limit: 5, windowMs: 60 * 60 * 1000 },
  moderationFlag: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
} as const;
