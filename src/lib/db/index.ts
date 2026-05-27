import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Singleton connection — Next.js will create one per worker.
// `prepare: false` keeps things simple for Postgres-js + RSC; revisit if perf becomes an issue.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 10,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
