/**
 * Pure helper that applies a scraped-changes proposal to the live courses
 * table. Extracted from actions.ts so it's importable from tests (server
 * action files can only export server actions).
 */

import { courses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface ScrapedChangeRow {
  entityId: string;
  changeType: string;
  newValue: unknown;
  oldValue: unknown;
}

// `db.transaction` callback param type — kept loose so this module doesn't
// have to import the heavy Drizzle types into a hot path.
type DbTx = {
  insert: typeof import("@/lib/db")["db"]["insert"];
  update: typeof import("@/lib/db")["db"]["update"];
  delete: typeof import("@/lib/db")["db"]["delete"];
};

export async function applyCourseChange(tx: DbTx, change: ScrapedChangeRow): Promise<void> {
  const code = change.entityId;
  const newVal = unwrapValue(change.newValue);

  switch (change.changeType) {
    case "added": {
      const title = typeof newVal === "string" ? newVal : `Untitled (${code})`;
      await tx.insert(courses).values({ code, title, credits: 3 }).onConflictDoNothing();
      break;
    }
    case "removed": {
      await tx.delete(courses).where(eq(courses.code, code));
      break;
    }
    case "title": {
      if (typeof newVal !== "string") throw new Error("title change has non-string newValue");
      await tx.update(courses).set({ title: newVal }).where(eq(courses.code, code));
      break;
    }
    case "credits": {
      const credits = typeof newVal === "number" ? newVal : Number.parseFloat(String(newVal));
      if (!Number.isFinite(credits)) throw new Error("credits change has non-numeric newValue");
      await tx.update(courses).set({ credits }).where(eq(courses.code, code));
      break;
    }
    case "description": {
      if (typeof newVal !== "string") throw new Error("description change has non-string newValue");
      await tx.update(courses).set({ description: newVal }).where(eq(courses.code, code));
      break;
    }
    case "prereq": {
      // Free-text prereq changes need a human to update structured JSON.
      // Mark approved but leave the courses row alone.
      break;
    }
    default:
      throw new Error(`unsupported changeType: ${change.changeType}`);
  }
}

export function unwrapValue(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "value" in raw) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}
