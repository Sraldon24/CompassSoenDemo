# 🧭 SOEN Compass

> **Plan your Software Engineering degree the smart way.**

An AI-powered degree planner for **Concordia BEng Software Engineering** students. Drag-and-drop term planning, AI chatbot with citation-aware RAG, deterministic prerequisite map, real-time plan validation, workload prediction, and AI-assisted email drafting — all free, all open source.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38B2AC)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/tests-370%20passing-success)](#testing)
[![Groq](https://img.shields.io/badge/AI-Groq%20Llama%203.3%2070B-orange)](https://groq.com/)

> 🚀 **Live** at [compasssoen1.up.railway.app](https://compasssoen1.up.railway.app) — currently **invite-only** (for the owner + approved friends).

---

## ✨ Features (current)

### 📅 Planning
- **Drag-and-drop term planner** powered by @dnd-kit — move courses across Fall 2026 → Winter 2030
- **Real-time plan validation** — prereq, coreq, and term-offering rules engine. Pure functions, 76 unit tests.
- **Workload predictor** — buckets each term as light / moderate / heavy / burnout based on community-rated hours/week or a 2.5 hr/credit fallback heuristic
- **Requirements checklist** — per-category progress against Concordia §71.70.9 (Eng Core 27.5, SE Core 73.5, Eng & Nat Sci 3, Nat Sci 6, SOEN Electives 16, Gen Ed 3, plus deficiencies)
- **Transfer-credit lane + deadlines** — a dedicated planner lane for CEGEP / advanced-standing transfers (add by hand or via import), and an EWT / milestone checklist on `/deadlines`
- **Excel import** — parses the user's hand-curated Concordia plan with per-row checkboxes to choose what to commit; routes transfers → the transfer lane and EWT/milestones → deadlines
- **PDF + .ics export** — printable plan + iCalendar feed for Google/Apple calendars

### 🤖 AI (Groq Llama 3.3 70B + 3.1 8B + Gemini 2.5 Flash + local sentence-transformers)
- **Ask Compass** chat with streaming responses and RAG over the catalog. A balanced router sends quick lookups to a fast model and strategic questions to 70B (with an 8s first-token race + Gemini/8B fallback, so it's never stuck on a slow free-tier call). A "Compass is thinking…" status shows during generation. Citations as numbered `[E1]`/`[1]` superscripts.
- **Smart course recommendations** — multi-step pipeline: eligibility filter → semantic similarity → 0-1 scoring → LLM picks top 5 with personalized "why" rationale. Hallucinated codes are filtered out automatically.
- **AI Review** (on `/plan`) — proactive workload / sequencing / elective suggestions grounded in your plan + detected issues. Cached per plan-hash so reloads cost nothing; Refresh forces a fresh pass.
- **AI Insight of the Day** — cached daily per-user plan summary
- **AI email drafting** — describe a situation, get a professional advisor/professor email
- **⌘K command palette** with keyword + semantic search across the catalog
- **`npm run research`** CLI — manual RAG + Concordia-calendar verification of any AI claim

### 👥 Community (Phase 4)
- **Course insights** — per-course "What students are saying" summaries from three sources, tried in order: **concordia.courses** (dense structured reviews — rating/difficulty/instructor, no key) → `old.reddit.com/*.json` → Brave Search (budget-guarded). Summarized by a 5-step LangGraph chain run **in parallel** (1×70B + 4×8B per course) with verbatim citations. Cached 7 days per course. ~1,960 concordia.courses reviews across 84 courses seeded in prod.
- **Difficulty votes** — easy / medium / hard per course, denormalized rolling average.
- **Anonymous professor reviews** — rating + difficulty + would-take-again, anonymous by default (the author's name is *never* returned for anon reviews).
- **Flag + moderation queue** — any user can flag a review (auto-hidden pending review); admins keep / remove / ban-author at `/admin/moderation`.
- **Public profiles** at `/u/[slug]` — no-auth shareable degree progress with a dynamic OG image (via `next/og`). Off by default; opt in at Settings → Privacy.
- **Demo mode** at `/demo` — no-auth sandbox with a sample plan + the live validation engine + a 5-message AI taste-test.
- **Weekly Concordia scraper** — diffs the calendar against the catalog into a `/admin/scraped-changes` review queue (cheerio parser, prefix-scoped, Unicode-hyphen-aware).

### 🔭 Observability + Privacy (Phase 4)
- **Sentry** error tracking (client + server + edge) with source-map upload on prod builds.
- **PostHog** analytics — 12 typed launch events, consent-gated + Do-Not-Track-respecting.
- **Cookie banner** — analytics only initialize after explicit accept.
- **GDPR controls** — one-click JSON data export + soft-delete with a 30-day grace window (hard purge via cron, cascade-wipes child rows).
- **AI fallback chain** — Groq 70B → Groq 8B → OpenRouter free models, so a Groq outage degrades gracefully instead of failing. OpenRouter has hard never-spend guards (`:free`-only allowlist + pre-flight $0-balance check).

### 🎨 Design + UX
- **Graphite Greens** palette via Tailwind v4 `@theme` tokens
- **Dark mode** via next-themes (persists per-user)
- **shadcn/ui new-york** + Base UI primitives for accessibility
- **Geist Sans + Geist Mono** with `ss01` + slashed-zero on all course codes / numerics

### 🧱 Foundations
- **Better Auth email/password** with Argon2id hashing, session cookies, 5-min cookie cache
- **Invite-only access** — signup is gated by an `ALLOWED_EMAILS` allowlist; new accounts start `pending` and an admin approves/rejects them at `/admin/users` (with an "awaiting approval" holding screen)
- **Postgres 16 + pgvector** (HNSW indexes, 384-dim embeddings)
- **Drizzle ORM** with type-safe queries (typed `inArray` helpers, never raw `sql\`... ANY(${array})\`` — see [docs/ARCHITECTURE.md ADR-013](docs/ARCHITECTURE.md))
- **Rate limiting** via lru-cache (50 chat / 20 recommend / 30 review / 30 email / 100 search per user per day) + an 85% Groq daily-quota circuit breaker
- **Biome** for lint + format (no ESLint / no Prettier)

---

## 📸 Screenshots

> Drop PNGs into `docs/screenshots/` with these names and they'll render here.

| | |
|---|---|
| ![Term planner](docs/screenshots/planner.png) **Drag-and-drop planner** | ![Ask Compass](docs/screenshots/chat.png) **Ask Compass (RAG chat)** |
| ![Prereq map](docs/screenshots/map.png) **Prerequisite map** | ![Course detail](docs/screenshots/course-detail.png) **Course detail + community** |
| ![Dashboard](docs/screenshots/dashboard.png) **Dashboard + AI insight** | ![Public profile](docs/screenshots/public-profile.png) **Public profile** |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22 LTS (current default — `nvm install 22` works)
- Docker + Docker Compose (for local Postgres + pgvector)
- A [Groq API key](https://console.groq.com/keys) (free, no credit card)

That's it for local dev. Google OAuth / Sentry / PostHog / Reddit are optional and only needed for production.

### Setup

```bash
git clone https://github.com/Sraldon24/CompassSoenDemo.git
cd CompassSoenDemo

# Use Node 22 LTS
nvm use 22

# Install deps
npm install

# Bring up Postgres + pgvector
npm run db:up

# Apply migrations
npm run db:migrate

# Seed the course catalog (124 courses from Concordia §71.70.9 + §71.70.10)
npm run seed:catalog
npm run db:embed         # generates 384-dim embeddings via @xenova/transformers

# (Optional) Seed a demo plan
npm run seed:user-plan -- --email you@example.com

# Copy + fill the env template
cp .env.local.example .env.local
# Required: GROQ_API_KEY. Optional but recommended:
#   GEMINI_API_KEY              — fast free chat fallback (else Groq 8B is used)
#   ADMIN_EMAIL                 — bootstrap admin (auto-approved; runs /admin/users)
#   ALLOWED_EMAILS              — comma-separated signup allowlist (invite-only).
#                                 Leave UNSET in local dev to keep signup open.

# Run dev server
npm run dev
```

> **Access control:** with `ALLOWED_EMAILS`/`ADMIN_EMAIL` set, signup is invite-only and new users land on `/pending` until an admin approves them at `/admin/users`. Unset locally → open signup (so dev isn't bricked).

Open [http://localhost:3000](http://localhost:3000), sign up, complete onboarding, and go to **/plan**.

### Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router | RSC + Server Actions in one codebase |
| Language | TypeScript 5 strict | `noUncheckedIndexedAccess` everywhere |
| Styling | Tailwind v4 + shadcn/ui + Graphite Greens tokens | Atomic, accessible, locked design system |
| DB | Postgres 16 + pgvector (HNSW) | $0, vector search in the same DB |
| ORM | Drizzle | Type-safe, edge-friendly, no codegen daemon |
| Auth | Better Auth (email/password) + **invite-only allowlist + admin approval** | Self-hosted, Argon2id, no vendor lock-in |
| AI | Groq Llama 3.1 8B + 3.3 70B, **Gemini 2.5 Flash** fast fallback, OpenRouter last resort | Fastest free-tier inference; quality-first chat router |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` local | $0, runs in Node, 384 dims |
| Lint + format | Biome | One Rust binary, no ESLint/Prettier split |
| Testing | Vitest (unit + integration) + Playwright (E2E) | 370 tests passing |
| Community sources | **concordia.courses** (primary) → old.reddit.com JSON → Brave Search | free, budget-guarded |
| Observability | Sentry + PostHog | errors + consent-gated analytics |
| Hosting | Railway | $5/mo credit covers app + Postgres |

**Total cost: $0/month** (all free tiers).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for decision records.

---

## 📂 Project Structure

```
CompassSoenDemo/
├── src/
│   ├── app/
│   │   ├── (auth)/             # /login, /signup, /onboarding (centered card layout)
│   │   ├── (dashboard)/        # /dashboard, /plan, /map, /requirements,
│   │   │                       # /chat, /emails, /settings/import (sidebar layout)
│   │   ├── api/
│   │   │   ├── ai/             # /chat (stream), /recommend, /draft-email
│   │   │   ├── auth/           # Better Auth catch-all
│   │   │   ├── search/         # ⌘K keyword + semantic
│   │   │   ├── import/         # Excel parse + preview + commit
│   │   │   └── export/         # PDF + .ics
│   │   ├── page.tsx            # landing
│   │   ├── layout.tsx          # ThemeProvider + Toaster + Tooltip
│   │   └── globals.css         # Graphite Greens @theme block
│   │   ├── (auth)/             # +/pending (awaiting approval), /onboarding
│   │   ├── api/ai/             # /chat (stream), /recommend, /review, /draft-email
│   │   └── admin/              # /users (approve/reject), /moderation, /scraped-changes
│   ├── components/
│   │   ├── ui/                 # shadcn primitives (Base UI under the hood)
│   │   ├── planner/            # course-card, planner-board, course-picker, ai-review, workload-badge
│   │   ├── prereq-map/         # SVG layered DAG renderer
│   │   ├── chat/               # ChatUI w/ streaming + "thinking…" status + citation chips
│   │   ├── dashboard/          # AI insight + recommendations widgets
│   │   ├── emails/             # template list + AI draft assistant
│   │   ├── nav/                # sidebar (admin link) + topbar
│   │   ├── common/             # command-palette (⌘K), cookie-banner, keyboard-shortcuts
│   │   └── providers/          # theme-provider, theme-toggle
│   ├── lib/                    # ── organized by domain ──
│   │   ├── auth/               # auth, auth-client, get-session, is-admin, access-control (allowlist)
│   │   ├── ai/                 # provider (model router + fallback), graphs/, embeddings, rag, prompts, usage
│   │   ├── community/          # concordia-courses, reddit, brave, fetch-posts, summaries, moderation, reviews
│   │   ├── data/               # db, schema, repositories/, queries/  (one data layer)
│   │   ├── domain/             # prereq-graph, requirements, term, workload
│   │   ├── limits/             # user rate-limit + Groq quota (config, limiter, store)
│   │   ├── api/                # route-guard (aiGuard + community guards), course-code
│   │   ├── validation/         # plan + auth (Zod) rules
│   │   ├── exports/ imports/ analytics/ account/ demo/ scraping/
│   │   └── ip-rate-limit.ts    # IP lru-cache buckets (demo route)
│   └── middleware.ts           # route protection (__Secure- cookie aware)
├── data/seed/                  # courses.json, courses-supplementary.json, …
├── seed/production-warmup.sql  # restorable community data dump (posts + summaries)
├── scripts/                    # seed-*, embed-courses, scrape-reddit, summarize-reddit,
│                               # ensure-pgvector (Railway start), purge-deleted-accounts (cron)
├── tests/                      # unit/ + integration/ + e2e/ — 370 passing
├── drizzle/                    # generated migrations + meta
├── docs/                       # ARCHITECTURE, PRD, DEPLOY, SETUP, design/
└── docker-compose.yml          # pgvector/pgvector:pg16
```

---

## 🧪 Testing

**370 tests passing** (Phase 1–4 + community expansion + architecture pass):

```bash
npm run test          # Vitest: unit + integration
npm run test:e2e      # Playwright: E2E
npm run lint          # Biome + SQL-pattern guard
npm run typecheck     # tsc --noEmit
```

Coverage spans the planner rules engine, workload predictor, recommend scoring, the deep-module refactor (term/excel/embedder/LLM-port/repos/limiter — see [docs/REFACTOR.md](docs/REFACTOR.md)), and the Phase 4 community layer: Reddit + Brave sources, the summarization graph (incl. prof-name dedupe regression), difficulty aggregates, anonymous-review privacy invariants, the moderation flag/keep/remove/ban flow, public-profile visibility rules, GDPR export/purge, the AI fallback chain, and the OpenRouter never-spend guards.

Integration tests hit real Postgres + pgvector + Groq. Groq-heavy graph tests are opt-in (`RUN_SUMMARIZE_GROQ_TESTS=1` / `RUN_HEAVY_GROQ_TESTS=1`) so a normal `npm test` stays under the Groq per-minute rate limit. Live-network tests skip with `SKIP_LIVE_NETWORK=1`.

### CI / pre-commit guard

`scripts/check-sql-patterns.sh` runs on every `npm run lint` and blocks committing the "drizzle sql-tag + JS array" footgun (a real bug we caught in Phase 3 — see [ADR-013](docs/ARCHITECTURE.md)).

---

## 🤖 AI architecture summary

Full deep-dive in [docs/PRD.md §16](docs/PRD.md) and [docs/ARCHITECTURE.md ADRs 011-012](docs/ARCHITECTURE.md).

```
User query
  │
  ▼
Extract explicit course codes (regex)
  │
  ▼
buildRAGContext()  →  assembleRAGContext() (pure: rank, force-include, truncate)
  ├── Force-include codes (catalog rows + prereqs + user plan status)
  ├── Embed query → pgvector cosine search top 5 (excluding explicit)
  └── Reddit/concordia.courses semantic top 5
  │
  ▼
Chat router (isComplexQuery): simple → fast model now;
  strategic → Groq 70B with an 8s first-token race
  │
  ▼
Fallback chain: Groq 70B → Gemini 2.5 Flash → Groq 8B → OpenRouter (free)
  with retry+backoff (1s/2s/4s) + an 85% daily-quota circuit breaker
  │
  ▼
Stream → client ("thinking…" status) + persist conversation + record aiUsage
```

- **Recommendations** only show the LLM a pre-ranked top-12 candidate list (`recommend-core.ts`, pure scoring); hallucinated course codes are filtered against the valid set.
- **AI Review** (on `/plan`) caches per user by plan-hash — re-loads cost $0 tokens; "Refresh" forces a fresh pass.
- **Summarization graph** runs its 5 steps in parallel (1×70B + 4×8B per course) to spare the scarce 70B daily quota.
- All `/ai/*` routes share `aiGuard` (auth → validate → rate-limit) + `runAiUsage` (usage accounting).

---

## 🛣️ Roadmap

- **Phase 1 — Foundation** ✅ (auth, DB, app shell, design system)
- **Phase 2 — Core Planner** ✅ (DnD, validation, workload, requirements, Excel import, onboarding)
- **Phase 3 — AI + Polish** ✅ (RAG, chat, recommendations, prereq map, email drafting, exports)
- **Phase 4 — Community + Launch** ✅ (course insights via concordia.courses/Reddit/Brave, difficulty votes, prof reviews, moderation, public profiles, demo mode, Sentry/PostHog wiring, GDPR, AI fallback chain)
- **Live on Railway** ✅ — deployed, invite-only (allowlist + admin approval), DB seeded. Post-launch: invite-only access control, AI Review, Gemini fast-fallback + chat router, concordia.courses data source, a deep-module architecture pass, and a domain-organized `src/lib` reorg.

---

## 🛠️ Useful scripts

```bash
npm run dev               # Next dev server (port 3000)
npm run build             # Production build
npm run db:up             # Start Postgres + pgvector container
npm run db:down           # Stop container
npm run db:generate       # Generate Drizzle migration from schema
npm run db:migrate        # Apply migrations
npm run db:studio         # Drizzle Studio (visual DB browser)
npm run db:seed           # Seed user's hand-curated Excel courses
npm run seed:catalog      # Seed the full 124-course Concordia catalog
npm run seed:user-plan    # Seed a demo plan for a specific email
npm run db:embed          # Generate course embeddings (re-runs only on changed rows)
npm run research -- "When can I take COMP 472?"   # Manual RAG + web verification
npm run scrape:reddit     # Scrape r/Concordia for course mentions (Reddit JSON → Brave fallback)
npm run summarize:reddit  # Summarize scraped posts per course via the LangGraph chain
npm run scrape:courses    # Diff Concordia calendar → /admin/scraped-changes queue
npm run purge:accounts    # Hard-delete accounts past the 30-day soft-delete grace
npm run test              # Vitest
npm run test:e2e          # Playwright
npm run lint              # Biome + SQL pattern guard
npm run lint:fix          # Auto-fix
npm run format            # Format only
npm run typecheck         # tsc --noEmit
```

---

## 📜 License

[MIT](LICENSE) © 2026 Amir Ghadimi

You can use this code freely. If you build something with it, a star ⭐ is appreciated but not required.

---

## 🙏 Acknowledgments

- **Concordia University** Gina Cody School calendar — the authoritative source for course data
- **airi-14x** for the [Concordia Master Guide](https://airi-14x.github.io/Concordia-Master-Guide/) that inspired the ENCS tips
- **stumash** for [ConU Course Planner](https://github.com/stumash/CoursePlanner) and its structured prereq data
- **r/Concordia** community for student perspectives that informed the AI prompt design
- **shadcn** + **Base UI** for accessible primitives
- **Vercel** for Next.js + the Geist fonts
- **Groq** for fast free-tier LLM inference
- **Hugging Face / Xenova** for the all-MiniLM-L6-v2 ONNX build that runs the embeddings in Node

---

## ⚠️ Disclaimer

SOEN Compass is **not affiliated with or endorsed by Concordia University**. Course information is sourced from publicly available Concordia calendar pages and a single student's hand-curated plan. Always verify with your academic advisor before making registration decisions. AI responses can be wrong even when cited — Compass is a planning aid, not an authority.

---

**Built with ☕ + 🤖 by a Concordia SOEN student, for Concordia SOEN students.**
