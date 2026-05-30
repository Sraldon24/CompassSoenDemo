// Runs before drizzle migrations on deploy. Migration 0000 declares
// vector(384) columns + HNSW indexes, so the pgvector extension must exist
// first. Locally the Docker image (pgvector/pgvector:pg16) ships it; in prod
// we create it idempotently here. Plain .mjs so it runs with `node` — no tsx
// (a devDependency that may be pruned in a production build) required.
//
// `postgres` is a regular dependency, so it's present at runtime.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[ensure-pgvector] DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log("[ensure-pgvector] vector extension ensured ✓");
} catch (err) {
  console.error("[ensure-pgvector] failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
