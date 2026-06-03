/**
 * Test-only bridge — lets integration tests invoke applyCourseChange against
 * a real DB transaction without going through the server-action boundary
 * (which requires a session). Production code does NOT import this file.
 */

import { db } from "@/lib/data/db";
import { type ScrapedChangeRow, applyCourseChange } from "./apply";

export async function applyCourseChangeForTesting(change: ScrapedChangeRow): Promise<void> {
  await db.transaction(async (tx) => {
    // The tx object has the same shape as the helper's DbTx interface.
    await applyCourseChange(tx as unknown as Parameters<typeof applyCourseChange>[0], change);
  });
}
