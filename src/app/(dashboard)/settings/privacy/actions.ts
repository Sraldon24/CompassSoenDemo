"use server";

/**
 * Server actions for the privacy settings page — public profile toggle,
 * slug, and per-field visibility.
 */

import { getSession } from "@/lib/auth/get-session";
import { SLUG_RX, slugify } from "@/lib/community/slug";
import { db } from "@/lib/data/db";
import { profiles } from "@/lib/data/schema";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true; slug?: string } | { ok: false; error: string };

export async function updatePrivacy(input: {
  isPublic: boolean;
  slug: string;
  showFuturePlan: boolean;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };

  // When going public, a valid + unique slug is required.
  let slug = slugify(input.slug);
  if (input.isPublic) {
    if (!SLUG_RX.test(slug)) {
      return { ok: false, error: "Slug must be 2-40 chars: lowercase letters, numbers, hyphens." };
    }
    const clash = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(and(eq(profiles.publicSlug, slug), ne(profiles.userId, session.user.id)));
    if (clash[0]) {
      return { ok: false, error: `Slug "${slug}" is taken. Pick another.` };
    }
  } else {
    // Keep the slug stored even when private so re-publishing keeps the URL,
    // but it's only resolvable when isPublic = true (enforced in the query).
    slug = slug || "";
  }

  await db
    .update(profiles)
    .set({
      isPublic: input.isPublic,
      publicSlug: slug || null,
      showFuturePlan: input.showFuturePlan,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, session.user.id));

  revalidatePath("/settings/privacy");
  return { ok: true, slug: slug || undefined };
}
