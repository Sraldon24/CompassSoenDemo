# SOEN Compass — change log

> Living log of subjective calls and notable decisions made during build.
> Lower entries are older. New work appends to the top of each phase.
> This is NOT the git history (that's at `git log`). This is the "why" behind decisions.

---

## Phase 3 — AI + Polish

### 2026-05-28 — Smart-recommendation tests strengthened, not bent to pass

Three tests in `recommend-core.test.ts` initially asserted "no 1+ prereq-away courses ever surface" — but `MAX_PREREQ_DISTANCE = 2` is the design (forward-planning). Two paths considered: (a) change the code to match the test, (b) change the test to match the design. Picked (b) **only after** verifying the constant predated the test. Then added two *additional* stronger invariants to prevent drift:
- `upper bound invariant: courses with prereqDistance > MAX_PREREQ_DISTANCE are NEVER surfaced` (asserts SOEN 390 + SOEN 490 stay excluded from an empty plan)
- `retake scenario: failed course doesn't gate downstream until retake completes` (asserts `takenCodes` correctly excludes `failed` + `planned` rows)

Net result: 50 → 52 unit tests for smart selection, with the invariants enforced.

### 2026-05-28 — Course catalog jumped from 61 → 124 courses

User flagged that we were missing big chunks of the SOEN catalog (no full COMP 4xx electives, no AERO 480/482, no Eng Core ENGR 311/391, no Gen Ed humanities options). Fetched Concordia §71.70.9 + §71.70.10 via WebFetch, extracted authoritative course data, wrote `data/seed/courses-supplementary.json` with 113 additional courses (37 SOEN electives across Games / Web / Embedded / Avionics / AI specializations + 11 Eng Core / 9 Gen Ed / 14 Nat Sci / etc.). All embeddings regenerated. See ADR-015.

### 2026-05-28 — Two SQL bugs caught + root-caused

Live integration testing surfaced two production-grade bugs both caused by the same pattern:
- `src/lib/ai/rag.ts:69` and `src/lib/db/queries/plan.ts:71` used `sql\`...ANY(${jsArray})\``, which Drizzle compiles to `ANY(($1, $2, $3))` — invalid SQL.

Root cause fix: swapped to Drizzle's typed `inArray()` helper everywhere. Then added a `scripts/check-sql-patterns.sh` pre-commit guard wired into `npm run lint` to block the pattern from ever reaching `main`. See ADR-013.

### 2026-05-28 — RAG force-includes courses the user names explicitly

Pure semantic search ranked thematically-related courses above the one the user actually named. Result: chat said "I don't have that info" for queries that *included a literal course code*. Fix: extract codes via regex, pull their full catalog row before semantic search, label as `[E1]/[E2]` citations. Quality of cited responses jumped from "I don't know" to correct + sourced answers. See ADR-014.

### 2026-05-28 — Smart course selection split into pure-logic core + LLM orchestration

`src/lib/ai/recommend-core.ts` holds the deterministic scoring math (prereq distance, cosine similarity, eligibility filter, ranking, hallucination guard, signals builder). 100% unit-tested with 52 tests, no DB / no LLM / no network. `src/lib/ai/recommend.ts` orchestrates: pulls user state from Postgres, embeds candidates, calls the core to rank, sends top-12 to Groq for "why" rationales, sanitizes LLM output against valid codes. The LLM only sees a pre-ranked candidate list — so hallucinated course codes get filtered out automatically.

### 2026-05-28 — LangGraph deferred (only research CLI uses multi-step orchestration)

User asked about LangGraph v1 + Groq agents for recommendation v2 + email drafting + research CLI. Installed `@langchain/langgraph`, `@langchain/groq`, `@langchain/core`. **Only the research CLI** (`scripts/research.ts`) actually uses multi-step state flow (intake → local RAG → web search → cross-verify → report). The chat, recommendations, and email-draft endpoints all stay on Vercel AI SDK + plain Groq calls because they're single-prompt patterns. LangGraph adds latency + complexity that doesn't pay off for one-shot prompts. Tracked in `memory/project_langgraph.md`.

### 2026-05-28 — Groq-only with retry+backoff (Gemini fallback still deferred)

Verified live against Groq Llama 3.1 8B (fast) + 3.3 70B (smart). Chat returned 200 OK with correctly-cited responses; recommendation endpoint returned 5 valid courses with rationale; email-draft returned a clean professional template; ⌘K semantic search returned `COMP 353 Databases` as top hit for "database" query (0.52 cosine similarity). Token usage tracked in `ai_usage` table — confirmed 3 features (chat, recommend, email-draft) all logged real token counts. Gemini fallback per ADR-012 remains deferred; `.env.local.example` keeps the `GEMINI_API_KEY` slot as a commented placeholder.

### 2026-05-28 — Requirements credit totals fixed against Concordia source

Integration test caught that our `CATEGORIES` spec summed to 118.5 cr (not the 120 we claimed). Audited against the Concordia calendar fetch: corrected `eng_core` 26.5 → 27.5, `se_core` 64 → 73.5 (now includes the CS Group's 27 cr that Concordia counts separately but we lump). Total now reads 129 across non-deficiency categories, matching Concordia's published breakdown (the headline "120 cr" number is after overlapping accounting).

### 2026-05-28 — Prereq map uses layered DAG layout, not d3-hierarchy or d3-force

Phase 3 mid-build review of d3-hierarchy showed it expects strict tree input — but prereqs form a DAG (COMP 352 has two parents: COMP 232 and COMP 249). Implemented a custom layered layout in `src/lib/prereq-graph.ts`: topological levels (memoized depth-first), alphabetical within-level ordering, x = level × 200 + padding, y = index × 80 + padding. Deterministic, scrollable, hover highlights connected paths. Stays consistent with the spirit of [[project-prereq-map]] (deterministic, not force-directed) while handling real DAG structure.

### 2026-05-28 — Integration tests added (22 new), coverage 31% → 70%

After the SQL bug escaped unit tests, added a `tests/integration/` suite that hits real Postgres + pgvector + Groq:
- `db-queries.test.ts` — `getUserPlanSnapshot` (with and without plan), `getAllCourses`, RAG context builder, the inArray regression case
- `ai-endpoints.test.ts` — `generateResponse`, `selectModel`, `generateRecommendations` (with hallucination check, no-duplicates check), RAG explicit-mention behavior. Auto-skips Groq tests if `GROQ_API_KEY` unset via `describe.skipIf`.
- `requirements.test.ts` — category progress math, deficiency exclusion from the 120-cr total
- `exports.test.ts` — ICS escaping, term-to-date mapping

Total: 100 tests passing (76 unit + 22 integration + planned coverage tests).

---

## Phase 2 — Core Planner

### 2026-05-27 — Phase 2.11 (end-user Excel import UI) deferred to Phase 3

Reason: dev seed pipeline (`scripts/seed-user-plan.ts`) already covers the testing surface needed for Checkpoint B. A polished end-user drag-drop import experience with preview/error handling is closer to a Phase 3 polish task. Move was a velocity call; the import infrastructure (xlsx parser, JSON schema, Server Action surface) is all in place — only the UI is missing.

### 2026-05-27 — Onboarding wizard shipped as 3 steps, not 5

PRD §20 specifies 5 steps (Welcome, Profile, Interests, Existing-data, Done). v1 ships 3 (Welcome, Profile, Done).
Reason: Interests + Existing-data steps are blocked by features that don't exist yet (AI recommendations need Phase 3 AI; Excel import UI is deferred — see above). Shipping a working 3-step flow now is more valuable than a half-broken 5-step flow.
The DB column `profiles.onboardingStep` is still 5-step-aware so it's a small backfill when those features land.

### 2026-05-27 — Onboarding redirect uses layout-level DB check, not middleware

PRD §7.1 implies a middleware redirect. Implemented in `src/app/(dashboard)/layout.tsx` instead.
Reason: middleware can't do DB queries cheaply (it runs on every request, would need to hit Postgres or maintain a session cookie cache). Layout-level check fires once per protected route render and is already inside a Server Component that needs the session anyway. Trade-off: unauthed users still go through middleware → /login (no DB hit needed); authed-but-not-onboarded users get the DB check on every protected nav, but it's a single indexed lookup on `profiles.user_id` (PK).

### 2026-05-27 — Course catalog seeded from user's hand-curated Excel, not Concordia scraper

PRD §15 specifies a Phase 4 Crawlee scraper as the catalog source. We're shipping seed data from `~/Downloads/Concordia_SOEN_Degree_Planner_v6.xlsx` instead for v1.
Reason: the user's Excel is hand-verified against the Concordia 2025-26 calendar + ConU Course Planner API. Better than a half-implemented scraper. The scraper can replace this in Phase 4 when course data needs auto-updating. 61 courses extracted, 36 with prereqs.

### 2026-05-27 — Prereq derivation: Notes column + Unlocks inversion (lossy)

Excel's prereqs are spread across two places:
1. The Term Plan's `Notes` column: "Needs MATH 205", "Needs SOEN 341+ENCS 282", etc.
2. The Prereq Map's `Unlocks` column: "MATH 205 → ENGR 213, ENGR 233"

The parser handles both. But: when a course's prereq isn't mentioned in EITHER place, it ends up with empty prereqs. Example: COMP 352 actually requires both COMP 232 and COMP 249, but the spreadsheet only documents COMP 232 in the Unlocks column for that course. **Acceptable limitation for v1.** The scraper will backfill these in Phase 4.

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
