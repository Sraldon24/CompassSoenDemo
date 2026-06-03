/**
 * Moderation helpers — flagging + admin resolution.
 *
 * Flow:
 *   - Any logged-in user flags a review via flagEntity(). Duplicate flags from
 *     the same user on the same entity are ignored (one flag per user/entity).
 *   - Flagging immediately flips the target's moderationStatus to "flagged" so
 *     it drops out of public listings pending review (fail-safe: hide first,
 *     ask questions later).
 *   - An admin resolves the flag via resolveFlag():
 *       "keep"   → restore target to active, mark flag resolved
 *       "remove" → set target to hidden, mark flag resolved
 *       "ban"    → hide ALL of that author's reviews, mark flag resolved
 *
 * Only professor_reviews are flaggable for v1 (difficulty votes have no free
 * text). entityType is kept generic so we can extend later.
 */

import { db } from "@/lib/data/db";
import { moderationFlags, professorReviews } from "@/lib/data/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export type FlaggableEntity = "professor_review";
export type ResolveAction = "keep" | "remove" | "ban";

export interface FlagInput {
  reporterId: string;
  entityType: FlaggableEntity;
  entityId: string;
  reason: string;
}

const MAX_REASON = 500;

export async function flagEntity(input: FlagInput): Promise<{ flagged: boolean }> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("reason is required");
  if (reason.length > MAX_REASON) throw new Error(`reason must be <= ${MAX_REASON} chars`);
  if (input.entityType !== "professor_review") {
    throw new Error(`unsupported entityType: ${input.entityType}`);
  }

  return db.transaction(async (tx) => {
    // Dedupe: one flag per user per entity.
    const existing = await tx
      .select({ id: moderationFlags.id })
      .from(moderationFlags)
      .where(
        and(
          eq(moderationFlags.reporterId, input.reporterId),
          eq(moderationFlags.entityType, input.entityType),
          eq(moderationFlags.entityId, input.entityId),
          eq(moderationFlags.status, "pending"),
        ),
      );
    if (existing[0]) return { flagged: false };

    await tx.insert(moderationFlags).values({
      reporterId: input.reporterId,
      entityType: input.entityType,
      entityId: input.entityId,
      reason,
      status: "pending",
    });

    // Fail-safe: hide the review immediately until an admin reviews it.
    await tx
      .update(professorReviews)
      .set({ moderationStatus: "flagged" })
      .where(eq(professorReviews.id, input.entityId));

    return { flagged: true };
  });
}

export interface PendingFlag {
  flagId: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: Date;
  /** The flagged review's content for context (null if entity was deleted). */
  reviewComment: string | null;
  reviewProfessorId: string | null;
  reviewAuthorId: string | null;
}

export async function getPendingFlags(): Promise<PendingFlag[]> {
  const rows = await db
    .select({
      flagId: moderationFlags.id,
      entityType: moderationFlags.entityType,
      entityId: moderationFlags.entityId,
      reason: moderationFlags.reason,
      createdAt: moderationFlags.createdAt,
      reviewComment: professorReviews.comment,
      reviewProfessorId: professorReviews.professorId,
      reviewAuthorId: professorReviews.userId,
    })
    .from(moderationFlags)
    // entity_id is text; professor_reviews.id is uuid. Cast the uuid to text
    // for the join so Postgres doesn't reject the comparison.
    .leftJoin(professorReviews, sql`${moderationFlags.entityId} = ${professorReviews.id}::text`)
    .where(eq(moderationFlags.status, "pending"))
    .orderBy(desc(moderationFlags.createdAt));

  return rows.map((r) => ({
    flagId: r.flagId,
    entityType: r.entityType,
    entityId: r.entityId,
    reason: r.reason,
    createdAt: r.createdAt,
    reviewComment: r.reviewComment ?? null,
    reviewProfessorId: r.reviewProfessorId ?? null,
    reviewAuthorId: r.reviewAuthorId ?? null,
  }));
}

export async function resolveFlag(
  flagId: string,
  action: ResolveAction,
  adminId: string,
): Promise<{ resolved: boolean }> {
  return db.transaction(async (tx) => {
    const flags = await tx
      .select()
      .from(moderationFlags)
      .where(and(eq(moderationFlags.id, flagId), eq(moderationFlags.status, "pending")));
    const flag = flags[0];
    if (!flag) return { resolved: false };

    if (flag.entityType === "professor_review") {
      if (action === "keep") {
        await tx
          .update(professorReviews)
          .set({ moderationStatus: "active" })
          .where(eq(professorReviews.id, flag.entityId));
      } else if (action === "remove") {
        await tx
          .update(professorReviews)
          .set({ moderationStatus: "hidden" })
          .where(eq(professorReviews.id, flag.entityId));
      } else if (action === "ban") {
        // Hide the offending review, find its author, hide all their reviews.
        const target = await tx
          .select({ userId: professorReviews.userId })
          .from(professorReviews)
          .where(eq(professorReviews.id, flag.entityId));
        const authorId = target[0]?.userId;
        if (authorId) {
          await tx
            .update(professorReviews)
            .set({ moderationStatus: "hidden" })
            .where(eq(professorReviews.userId, authorId));
        }
      }
    }

    await tx
      .update(moderationFlags)
      .set({ status: "resolved", reviewedBy: adminId, reviewedAt: new Date() })
      .where(eq(moderationFlags.id, flagId));

    return { resolved: true };
  });
}

export { MAX_REASON };
