/**
 * GDPR data-portability + erasure helpers.
 *
 *   - exportUserData(userId): assembles everything we hold about a user into a
 *     single JSON object for download (Article 20, data portability).
 *   - scheduleAccountDeletion(userId): soft-deletes (sets users.deletedAt) and
 *     records a purge-after date 30 days out. A cron (or manual sweep) hard-
 *     deletes after the grace window, at which point ON DELETE CASCADE wipes
 *     all child rows. Soft-delete keeps the door open for "undo" during grace.
 *
 * We keep the actual hard purge as a separate explicit step so an accidental
 * delete is recoverable for 30 days.
 */

import { db } from "@/lib/db";
import {
  aiConversations,
  aiMessages,
  difficultyVotes,
  professorReviews,
  profiles,
  userCourses,
  users,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";

export interface UserDataExport {
  exportedAt: string;
  account: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  courses: Record<string, unknown>[];
  difficultyVotes: Record<string, unknown>[];
  professorReviews: Record<string, unknown>[];
  conversations: Array<{
    conversation: Record<string, unknown>;
    messages: Record<string, unknown>[];
  }>;
}

export async function exportUserData(userId: string): Promise<UserDataExport> {
  // Fan out the independent per-table reads concurrently (no N+1).
  const [accountRows, profileRows, courses, votes, reviews, convos] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId)),
    db.select().from(profiles).where(eq(profiles.userId, userId)),
    db.select().from(userCourses).where(eq(userCourses.userId, userId)),
    db.select().from(difficultyVotes).where(eq(difficultyVotes.userId, userId)),
    db.select().from(professorReviews).where(eq(professorReviews.userId, userId)),
    db.select().from(aiConversations).where(eq(aiConversations.userId, userId)),
  ]);

  // Single batched fetch for all messages, then group in JS — replaces the
  // old one-query-per-conversation N+1 loop. Guard the empty case: Drizzle
  // emits invalid SQL for `IN ()`.
  const convoIds = convos.map((c) => c.id);
  const allMessages =
    convoIds.length > 0
      ? await db.select().from(aiMessages).where(inArray(aiMessages.conversationId, convoIds))
      : [];
  const messagesByConvo = new Map<string, Record<string, unknown>[]>();
  for (const m of allMessages) {
    const list = messagesByConvo.get(m.conversationId) ?? [];
    list.push(m as Record<string, unknown>);
    messagesByConvo.set(m.conversationId, list);
  }

  return {
    exportedAt: new Date().toISOString(),
    account: (accountRows[0] as Record<string, unknown>) ?? null,
    profile: (profileRows[0] as Record<string, unknown>) ?? null,
    courses: courses as Record<string, unknown>[],
    difficultyVotes: votes as Record<string, unknown>[],
    professorReviews: reviews as Record<string, unknown>[],
    conversations: convos.map((c) => ({
      conversation: c as Record<string, unknown>,
      messages: messagesByConvo.get(c.id) ?? [],
    })),
  };
}

export const DELETION_GRACE_DAYS = 30;

export interface DeletionResult {
  scheduled: boolean;
  purgeAfter: string;
}

/**
 * Soft-delete the account. Stamps users.deletedAt = now. The purge date
 * (now + 30d) is returned for display; the actual hard delete is performed by
 * purgeExpiredAccounts() on or after that date.
 */
export async function scheduleAccountDeletion(userId: string, now: Date): Promise<DeletionResult> {
  await db.update(users).set({ deletedAt: now }).where(eq(users.id, userId));
  const purgeAfter = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return { scheduled: true, purgeAfter: purgeAfter.toISOString() };
}

/** Undo a pending deletion during the grace window. */
export async function cancelAccountDeletion(userId: string): Promise<void> {
  await db.update(users).set({ deletedAt: null }).where(eq(users.id, userId));
}

export interface PurgeResult {
  purged: number;
  /** IDs hard-deleted this run — handy for structured cron logging. */
  deletedIds: string[];
}

/**
 * Hard-delete all users whose deletedAt is older than the grace window, in a
 * SINGLE transactional batched DELETE.
 *
 * Previously this scanned every user into memory and deleted them one-by-one
 * with no transaction — a failure mid-loop left the DB partially purged. Now
 * the WHERE filter runs in SQL and the whole delete is atomic: it either
 * removes every expired account (cascade-wiping child rows) or none.
 */
export async function purgeExpiredAccountsDetailed(now: Date): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.transaction(async (tx) =>
    tx
      .delete(users)
      .where(and(isNotNull(users.deletedAt), lte(users.deletedAt, cutoff)))
      .returning({ id: users.id }),
  );
  return { purged: deleted.length, deletedIds: deleted.map((r) => r.id) };
}

/** Back-compat wrapper — returns just the count (existing callers + tests). */
export async function purgeExpiredAccounts(now: Date): Promise<number> {
  return (await purgeExpiredAccountsDetailed(now)).purged;
}
