/**
 * Course-catalog repository — read access to the `courses` table.
 *
 * Wraps Drizzle behind an interface so callers depend on the contract, not the
 * connection. `makeCourseCatalogRepository(db)` builds an instance; the default
 * singleton `courseCatalogRepo` is bound to the pooled handle for app code.
 */

import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { asc, inArray } from "drizzle-orm";
import type { DbHandle } from "./types";

const CATALOG_COLUMNS = {
  code: courses.code,
  title: courses.title,
  credits: courses.credits,
  category: courses.category,
  prereqs: courses.prereqs,
  offeredFall: courses.offeredFall,
  offeredWinter: courses.offeredWinter,
  offeredSummer: courses.offeredSummer,
  avgHoursPerWeek: courses.avgHoursPerWeek,
} as const;

type CatalogRow = {
  code: string;
  title: string;
  credits: number;
  category: string | null;
  prereqs: unknown;
  offeredFall: boolean | null;
  offeredWinter: boolean | null;
  offeredSummer: boolean | null;
  avgHoursPerWeek: number | null;
};

/** Normalize a raw catalog row into the domain `CourseCatalogEntry`. */
export function toCatalogEntry(r: CatalogRow): CourseCatalogEntry {
  return {
    code: r.code,
    title: r.title,
    credits: r.credits,
    category: r.category ?? null,
    prereqs: (r.prereqs as CourseCatalogEntry["prereqs"]) ?? undefined,
    offeredFall: r.offeredFall ?? true,
    offeredWinter: r.offeredWinter ?? true,
    offeredSummer: r.offeredSummer ?? false,
    avgHoursPerWeek: r.avgHoursPerWeek ?? undefined,
  };
}

export interface CourseCatalogRepository {
  /** Full catalog, ordered by code. */
  findAll(): Promise<CourseCatalogEntry[]>;
  /** Catalog entries for a set of codes (uses `inArray` per ADR-013). */
  findByCodes(codes: string[]): Promise<CourseCatalogEntry[]>;
}

export function makeCourseCatalogRepository(handle: DbHandle): CourseCatalogRepository {
  return {
    async findAll(): Promise<CourseCatalogEntry[]> {
      const rows = await handle.select(CATALOG_COLUMNS).from(courses).orderBy(asc(courses.code));
      return rows.map(toCatalogEntry);
    },

    async findByCodes(codes: string[]): Promise<CourseCatalogEntry[]> {
      if (codes.length === 0) return [];
      const rows = await handle
        .select(CATALOG_COLUMNS)
        .from(courses)
        .where(inArray(courses.code, codes));
      return rows.map(toCatalogEntry);
    },
  };
}

export const courseCatalogRepo = makeCourseCatalogRepository(db);
