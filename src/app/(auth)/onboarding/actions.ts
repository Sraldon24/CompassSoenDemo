"use server";

import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { TERM_REGEX } from "@/lib/term";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const profileSchema = z.object({
  program: z.enum(["SOEN-General", "SOEN-AvionicsEmbedded", "SOEN-Web", "SOEN-RealTime"]),
  entryTerm: z.string().regex(TERM_REGEX, "Format: 'Fall 2026'"),
  studentId: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function upsertProfile(
  userId: string,
  data: Partial<typeof profiles.$inferInsert>,
): Promise<void> {
  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (existing.length === 0) {
    await db.insert(profiles).values({ userId, ...data });
  } else {
    await db
      .update(profiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
  }
}

export async function submitProfileStep(input: {
  program: string;
  entryTerm: string;
  studentId?: string;
}): Promise<ActionResult<{ next: number }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await upsertProfile(session.user.id, {
    program: parsed.data.program,
    entryTerm: parsed.data.entryTerm,
    studentId: parsed.data.studentId,
    onboardingStep: 2,
  });

  revalidatePath("/onboarding");
  return { success: true, data: { next: 2 } };
}

export async function completeOnboarding(): Promise<ActionResult<{ ok: true }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  await upsertProfile(session.user.id, {
    onboardingCompleted: true,
    onboardingStep: 3,
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
