#!/usr/bin/env bash
#
# dump-warmup.sh — export the locally-scraped community tables into an
# idempotent SQL file for the one-time production pre-warm (see docs/DEPLOY.md).
#
# Why: prod should NOT re-scrape Reddit or re-run the Groq summarizer from
# scratch — that wastes the Brave budget + Groq daily RPD. We ship the data we
# already paid to generate locally.
#
# Output: seed/production-warmup.sql  (--data-only, --on-conflict-do-nothing
# semantics via --inserts + a guard). Run inside the local Docker Postgres.
#
# Usage:  bash scripts/dump-warmup.sh

set -euo pipefail

CONTAINER="compass-postgres"
DB_USER="compass"
DB_NAME="compass_dev"
OUT="seed/production-warmup.sql"

mkdir -p seed

# --inserts makes column-explicit INSERT statements; --on-conflict-do-nothing
# (pg_dump 16+) appends ON CONFLICT DO NOTHING so re-running never duplicates
# or overwrites prod rows.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --data-only \
  --inserts \
  --on-conflict-do-nothing \
  --table=reddit_posts \
  --table=reddit_summaries \
  --table=brave_usage \
  > "$OUT"

LINES=$(wc -l < "$OUT")
echo "[dump-warmup] Wrote $OUT ($LINES lines)."
echo "[dump-warmup] Tables: reddit_posts, reddit_summaries, brave_usage."
echo "[dump-warmup] Restore in prod (one-time): railway run bash -c 'psql \"\$DATABASE_URL\" < $OUT'"
