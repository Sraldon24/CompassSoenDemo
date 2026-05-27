# SOEN Compass — change log

> Living log of subjective calls and notable decisions made during build.
> Lower entries are older. New work appends to the top of each phase.
> This is NOT the git history (that's at `git log`). This is the "why" behind decisions.

---

## Phase 1 — Foundation

### 2026-05-27 — Email/password Better Auth ships first

Better Auth wired with email/password only for v1, NOT Google OAuth.
Reason: user paused Google OAuth setup mid-session. Email/password unblocks the entire app immediately; Google can be added later as an additional provider (Better Auth supports both — adding Google is ~10 min of config, not a refactor).

The `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars are kept (empty) in `.env.local` and `.env.local.example` so the slot is reserved.

### 2026-05-27 — Switched Postgres data location from host bind mount to Docker named volume

The `docker-compose.yml` initially used `./postgres-data:/var/lib/postgresql/data` as a bind mount. This broke shadcn's file scanner with permission-denied errors because the container writes those files as a non-host UID.

Fix: switched to a named volume (`compass-postgres-data`). No host directory needed. To wipe the DB during dev: `docker compose down -v`.

### 2026-05-27 — Drizzle schema uses PRD's plural table names

PRD §3 uses `users`, `sessions`, `accounts`, etc. (plural). Better Auth defaults to singular (`user`, `session`, `account`, `verification`). Resolved by passing an explicit `schema` map to `drizzleAdapter` in `src/lib/auth.ts` so plural names are used consistently.

### 2026-05-27 — Gemini fallback deferred for v1

PRD originally specified a 3-tier AI provider (Groq fast → Groq smart → Gemini fallback). For v1 we ship Groq-only with retry+backoff on 429 (3 attempts, 1s/2s/4s).
Reason: user wants to ship faster. Gemini adds an extra SDK + provider tested against, doubling the AI maintenance burden. Groq's free tier (~28,800 RPD across two models) is plenty for v1 scale.
Captured as ADR-012 in `docs/ARCHITECTURE.md`. `.env.local.example` keeps the `GEMINI_API_KEY` slot commented out.

### 2026-05-27 — Skipping Reddit API integration for now

User's Reddit account is too new to create a script-type API app at `reddit.com/prefs/apps`. Skipped entirely for today. Phase 4 will revisit: try API first, fall back to `old.reddit.com/.json` (no-auth, 60 req/min/IP), then RSS as last resort. Schema columns (`reddit_posts`, `reddit_embeddings`) stay in place from day one so we don't need a schema migration when Reddit is wired up.

### 2026-05-27 — Workflow: 2 checkpoints (B and D), not 4

User picked the 2-checkpoint workflow: SKIP Checkpoint A (auth plumbing) and Checkpoint C (AI quality). Only stop at Checkpoint B (Phase 2 planner working) and Checkpoint D (launch-ready).
Total user review time across ~11-13 weeks: ~30-60 minutes.

### 2026-05-27 — Prereq map will use d3-hierarchy tree layout

Original PRD §4.3 said "D3 force-directed graph." Changed to `d3-hierarchy` (tree/cluster layout).
Reason: force-directed graphs produce visually chaotic results that don't communicate prereq depth. Tree layout auto-positions by depth from root → leaves, which is exactly what a prereq map should show. Deterministic, no physics simulation, scales as courses are added.

### 2026-05-27 — Design tokens come from `docs/design/HANDOFF.md`, NOT PRD §8

The earlier PRD §8 OKLCH palette (brand-500 blue) is superseded by the Claude Designs handoff bundle's **Graphite Greens** palette. The `@theme` block in `src/app/globals.css` is pasted directly from `HANDOFF.md` §1.
PRD §8 has been marked as superseded with a `<details>` block preserving the original values for historical reference.
