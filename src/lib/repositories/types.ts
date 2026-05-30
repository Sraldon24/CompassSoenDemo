/**
 * Repository seam types.
 *
 * `DbHandle` is anything you can run Drizzle queries on — the pooled singleton
 * `db`, a transaction, or (future) a PGLite-backed handle in tests. Repository
 * factories take a `DbHandle` so business logic depends on the interface, not
 * the concrete connection. Methods that may run inside a caller-supplied
 * transaction accept `Executor`.
 *
 * Phase 1 of the repository migration (see docs/REFACTOR.md): establishes the
 * seam + folds the existing partial repo in `db/queries/plan.ts`. Later phases
 * adopt these across actions/routes/graphs.
 */

import type { db } from "@/lib/db";

/** The pooled connection (or any Drizzle handle with the same surface). */
export type DbHandle = typeof db;

/** A Drizzle transaction handle (first arg of `db.transaction`). */
export type Tx = Parameters<Parameters<DbHandle["transaction"]>[0]>[0];

/** Anything queries can run on: the pooled handle OR a transaction. */
export type Executor = DbHandle | Tx;
