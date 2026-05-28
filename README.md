# 🧭 SOEN Compass

> **Plan your Software Engineering degree the smart way.**

An AI-powered degree planner for **Concordia BEng Software Engineering** students. Drag-and-drop term planning, AI chatbot with citation-aware RAG, deterministic prerequisite map, real-time plan validation, workload prediction, and AI-assisted email drafting — all free, all open source.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38B2AC)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/tests-98%20passing-success)](#testing)
[![Groq](https://img.shields.io/badge/AI-Groq%20Llama%203.3%2070B-orange)](https://groq.com/)

> ⚠️ Pre-launch (Phase 3 complete). Public r/Concordia launch comes after Phase 4 (community + observability).

---

## ✨ Features (current)

### 📅 Planning
- **Drag-and-drop term planner** powered by @dnd-kit — move courses across Fall 2026 → Winter 2030
- **Real-time plan validation** — prereq, coreq, and term-offering rules engine. Pure functions, 76 unit tests.
- **Workload predictor** — buckets each term as light / moderate / heavy / burnout based on community-rated hours/week or a 2.5 hr/credit fallback heuristic
- **Requirements checklist** — per-category progress against Concordia §71.70.9 (Eng Core 27.5, SE Core 73.5, Eng & Nat Sci 3, Nat Sci 6, SOEN Electives 16, Gen Ed 3, plus deficiencies)
- **Excel import** — parses the user's hand-curated Concordia plan (`Term Plan` sheet) with preview + skip-errors mode
- **PDF + .ics export** — printable plan + iCalendar feed for Google/Apple calendars

### 🤖 AI (Groq Llama 3.3 70B + 3.1 8B + local sentence-transformers)
- **Ask Compass** chat with streaming responses and RAG over the catalog. Citations as numbered `[E1]`/`[1]` superscripts.
- **Smart course recommendations** — multi-step pipeline: eligibility filter → semantic similarity → 0-1 scoring → LLM picks top 5 with personalized "why" rationale. Hallucinated codes are filtered out automatically.
- **AI Insight of the Day** — cached daily per-user plan summary
- **AI email drafting** — describe a situation, get a professional advisor/professor email
- **⌘K command palette** with keyword + semantic search across the 124-course catalog
- **`npm run research`** CLI — manual RAG + Concordia-calendar verification of any AI claim

### 🎨 Design + UX
- **Graphite Greens** palette via Tailwind v4 `@theme` tokens
- **Dark mode** via next-themes (persists per-user)
- **shadcn/ui new-york** + Base UI primitives for accessibility
- **Geist Sans + Geist Mono** with `ss01` + slashed-zero on all course codes / numerics

### 🧱 Foundations
- **Better Auth email/password** with Argon2id hashing, session cookies, 5-min cookie cache
- **Postgres 16 + pgvector** (HNSW indexes, 384-dim embeddings)
- **Drizzle ORM** with type-safe queries (typed `inArray` helpers, never raw `sql\`... ANY(${array})\`` — see [docs/ARCHITECTURE.md ADR-013](docs/ARCHITECTURE.md))
- **Rate limiting** via lru-cache (50 chat / 20 recommend / 30 email / 100 search per user per day)
- **Biome** for lint + format (no ESLint / no Prettier)

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
# Then paste your GROQ_API_KEY into .env.local

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, complete onboarding, and go to **/plan**.

### Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router | RSC + Server Actions in one codebase |
| Language | TypeScript 5 strict | `noUncheckedIndexedAccess` everywhere |
| Styling | Tailwind v4 + shadcn/ui + Graphite Greens tokens | Atomic, accessible, locked design system |
| DB | Postgres 16 + pgvector (HNSW) | $0, vector search in the same DB |
| ORM | Drizzle | Type-safe, edge-friendly, no codegen daemon |
| Auth | Better Auth (email/password) | Self-hosted, Argon2id, no vendor lock-in |
| AI | Groq Llama 3.1 8B + 3.3 70B | Fastest free-tier inference in 2026 |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` local | $0, runs in Node, 384 dims |
| Lint + format | Biome 1.9 | One Rust binary, no ESLint/Prettier split |
| Testing | Vitest (unit + integration) + Playwright (E2E) | 98 tests passing |
| Hosting | Railway (planned) | $5/mo credit covers app + Postgres |

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
│   ├── components/
│   │   ├── ui/                 # shadcn primitives (Base UI under the hood)
│   │   ├── planner/            # course-card, term-column, planner-board, workload-badge
│   │   ├── prereq-map/         # SVG layered DAG renderer
│   │   ├── chat/               # ChatUI w/ streaming + citation chips
│   │   ├── dashboard/          # AI insight + recommendations widgets
│   │   ├── emails/             # template list + AI draft assistant
│   │   ├── nav/                # sidebar + topbar
│   │   ├── command-palette.tsx # ⌘K
│   │   └── theme-toggle.tsx
│   ├── lib/
│   │   ├── ai/                 # provider, embeddings, prompts, rag, recommend, recommend-core, types, usage
│   │   ├── db/                 # schema, client, queries/
│   │   ├── exports/            # ics, pdf
│   │   ├── validation/plan.ts  # rules engine (pure functions)
│   │   ├── workload.ts         # statistical predictor
│   │   ├── requirements.ts     # category spec + progress math
│   │   ├── prereq-graph.ts     # layered DAG layout
│   │   └── rate-limit.ts       # lru-cache buckets
│   └── middleware.ts           # route protection
├── data/seed/                  # courses.json, courses-supplementary.json,
│                               # email-templates.json, user-plan-amir.json
├── scripts/                    # parse-excel, seed-courses, seed-supplementary,
│                               # seed-user-plan, embed-courses, research,
│                               # check-sql-patterns.sh
├── tests/
│   ├── unit/                   # plan, workload, recommend-core (76 tests)
│   ├── integration/            # db-queries, ai-endpoints, requirements, exports (22 tests)
│   └── e2e/                    # Playwright auth + planner (9 tests)
├── drizzle/                    # generated migrations + meta
├── docs/                       # ARCHITECTURE, PRD, CLAUDE, SETUP, design/
└── docker-compose.yml          # pgvector/pgvector:pg16
```

---

## 🧪 Testing

**98 tests passing** as of Phase 3:

```bash
npm run test          # Vitest: unit + integration (76 + 22)
npm run test:e2e      # Playwright: 9 E2E tests
npm run lint          # Biome + SQL-pattern guard
npm run typecheck     # tsc --noEmit
```

| Suite | Files | Tests | What it covers |
|---|---|---|---|
| **Unit** | 3 | 76 | Plan validation (14), workload predictor (12), recommend-core scoring + persona scenarios (50) |
| **Integration** | 4 | 22 | DB queries, RAG pipeline, AI endpoints, requirements math, ICS generator |
| **E2E (Playwright)** | 2 | 9 | Anon landing, signup → onboarding → dashboard → sign out, login validation, planner page, requirements page |

Integration tests hit real Postgres + pgvector + Groq. They auto-skip Groq-dependent tests if `GROQ_API_KEY` is unset (`describe.skipIf`).

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
buildRAGContext()
  ├── Force-include codes (catalog rows + prereqs + user plan status)
  ├── Embed query → pgvector cosine search top 5 (excluding explicit)
  └── (Phase 4) Reddit semantic top 5
  │
  ▼
selectModel(task) → Groq Llama 3.3 70B (smart) or 3.1 8B (fast)
  │
  ▼
generateResponse() with retry+backoff (1s/2s/4s)
  │
  ▼
Stream → client + persist conversation + record aiUsage
```

For recommendations, the LLM only sees a pre-ranked top-12 candidate list (computed by `recommend-core.ts` — pure scoring functions). Hallucinated course codes are filtered against the valid candidate set before being shown.

---

## 🛣️ Roadmap

- **Phase 1 — Foundation** ✅ (auth, DB, app shell, design system)
- **Phase 2 — Core Planner** ✅ (DnD, validation, workload, requirements, Excel import, onboarding)
- **Phase 3 — AI + Polish** ✅ (RAG, chat, recommendations, prereq map, email drafting, exports)
- **Phase 4 — Community + Launch** ⏳ (Reddit scraper, difficulty votes, prof reviews, public profiles, Sentry, PostHog, rate limiting in prod, r/Concordia launch)

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
