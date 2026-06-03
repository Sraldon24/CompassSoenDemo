# DEPLOY.md — Railway (GitHub-linked auto-CD)

> SOEN Compass deploys to Railway, **linked to the GitHub repo** so every push
> to `main` auto-builds and deploys. Migrations run automatically on each deploy
> (`railway.json` startCommand = `db:migrate && start`). The scraped-data
> pre-warm is a **one-time** manual restore after the first deploy.

## Model

- **Trigger:** push/merge to `main` → Railway builds (Nixpacks, Next.js 16) → runs `npm run db:migrate` → `npm run start`.
- **DB:** Railway Postgres plugin (pgvector available). `DATABASE_URL` injected automatically.
- **Migrations:** automatic, idempotent (drizzle-kit). `drizzle-kit` is a devDependency; Railway keeps node_modules after build so it's present at start. If a deploy fails on `db:migrate: command not found`, move `drizzle-kit` to `dependencies`.

## One-time setup (CLI — run from repo root)

Prereq: `railway login` (done), repo pushed to GitHub.

```bash
# 1. Create the project + link this repo for auto-deploy
railway init                       # name it "soen-compass"
railway link                       # select the project if not auto-linked

# 2. Add Postgres (pgvector-capable)
railway add --database postgres

# 3. Set env vars (values from .env.local). DATABASE_URL is auto-provided.
railway variables --set BETTER_AUTH_SECRET="…" \
  --set BETTER_AUTH_URL="https://<your-railway-domain>" \
  --set NEXT_PUBLIC_SITE_URL="https://<your-railway-domain>" \
  --set ADMIN_EMAIL="sraldon24@gmail.com" \
  --set ALLOWED_EMAILS="sraldon24@gmail.com,friend@example.com" \  # invite-only signup allowlist
  --set GROQ_API_KEY="…" \
  --set GEMINI_API_KEY="…" \                                       # fast free chat fallback (Gemini 2.5 Flash)
  --set OPENROUTER_API_KEY="…" \
  --set NEXT_PUBLIC_SENTRY_DSN="…" \
  --set SENTRY_AUTH_TOKEN="…" \
  --set SENTRY_TRACES_SAMPLE_RATE="0.1" \
  --set NEXT_PUBLIC_POSTHOG_KEY="…" \
  --set NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com" \
  --set BRAVE_SEARCH_API_KEY="…"

# 4. Connect GitHub for auto-CD (or do it in the dashboard: Settings → Source → GitHub repo)
#    Once connected, every push to main deploys automatically.

# 5. First deploy (also triggered by the GitHub link on next push)
railway up

# 6. Get the public domain, then update the two URL vars to match it
railway domain
railway variables --set BETTER_AUTH_URL="https://<domain>" --set NEXT_PUBLIC_SITE_URL="https://<domain>"

# 7. Seed the catalog (idempotent) on the prod DB
railway run npm run seed:catalog
railway run npm run db:embed

# 8. ONE-TIME pre-warm: restore the scraped Reddit data so prod doesn't
#    re-scrape/re-summarize (wasting Brave queries + Groq budget). See
#    seed/production-warmup.sql (generated locally via scripts/dump-warmup.sh).
#    Guarded: only restores rows that don't already exist.
railway run bash -c 'psql "$DATABASE_URL" < seed/production-warmup.sql'

# 9. Verify
railway run psql "$DATABASE_URL" -c "SELECT count(*) FROM reddit_summaries;"
```

## Cron jobs (set up as Railway Cron services)

- Weekly Concordia scrape:  `npm run scrape:courses`
- Weekly Reddit refresh:    `npm run scrape:reddit && npm run summarize:reddit -- --only-stale`
- Daily GDPR purge:         `npm run purge:accounts`

## Re-deploys

Just `git push origin main`. Migrations re-run (idempotent). The warmup restore in
step 8 is NOT in the deploy path — it's one-time, and the SQL uses `ON CONFLICT
DO NOTHING` so re-running it never duplicates or wipes data.
