<div align="center">

# 🧭 SOEN Compass

### Plan your Concordia Software Engineering degree the smart way — and host it yourself.

An open-source, AI-powered degree planner for **Concordia BEng Software Engineering** students:
drag-and-drop term planning, an AI advisor with citation-grounded RAG, a deterministic
prerequisite map, real-time plan validation, and community course insights — built to run on
**$0/month** so any student can self-host it for their own degree journey.

[![Live demo](https://img.shields.io/badge/▶_Live-compasssoen1.up.railway.app-d97333)](https://compasssoen1.up.railway.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5_strict-3178c6)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-388_passing-3f8f5f)](#-testing)
[![Cost](https://img.shields.io/badge/cost-%240%2Fmonth-3f8f5f)](#-self-hosting)

</div>

---

## 💡 Why this exists

Concordia's SOEN degree is a 120-credit maze of prerequisites, co-requisites, term-offering rules,
and workload landmines. Existing tools are static PDFs or spreadsheets. **SOEN Compass** turns
degree planning into an interactive, AI-assisted experience — and because every student's situation
is different (transfers, deficiencies, part-time, accelerated), **it's fully open source and
self-hostable on free tiers**. Clone it, point it at your own free Groq key, and own your plan.

> 🚀 **Live (invite-only beta):** [compasssoen1.up.railway.app](https://compasssoen1.up.railway.app)
> · 🧪 **Try it with no account:** the [`/demo`](https://compasssoen1.up.railway.app/demo) sandbox
> (sample plan + live validation + an AI taste-test)

---

## 🛠️ Engineering highlights

The parts I'm most proud of, for the curious / the hiring:

| Area | What's interesting |
|---|---|
| **Citation-grounded RAG** | Query → regex force-include of named courses → pgvector cosine top-K (with a relevance floor) → assembled context → streamed answer with numbered `[E1]`/`[1]` citations. Hallucinated course codes are filtered against the valid catalog set. |
| **Quality-first AI router + fallback chain** | A heuristic router sends quick lookups to a fast model and strategic questions to **Llama 3.3 70B**, racing its first token against an 8s timeout. Full fallback chain **Groq 70B → Gemini 2.5 Flash → Groq 8B → OpenRouter (free)** with retry/backoff + an 85%-of-daily-quota circuit breaker, so a single-provider outage degrades gracefully instead of failing. |
| **Never-spend guardrails** | OpenRouter is `:free`-only with a model allowlist + a per-process $0-balance pre-flight check, so the fallback can never draw down credit. |
| **Multi-step LangGraph pipelines** | Recommendations, email drafting, and Reddit-summarization run as explicit state-machine graphs. The summarizer fans out **1×70B + 4×8B in parallel per course** to spare the scarce 70B daily quota. |
| **Deterministic rules engine** | Prereq/coreq/term-offering validation and the layered-DAG prereq map are **pure functions** — no LLM, fully unit-tested, reproducible. |
| **Consistent API contract** | Every JSON route returns a `{ success, payload, error }` envelope via shared `apiOk`/`apiError` helpers; internal errors are logged server-side and never leaked to clients. |
| **Typed data layer** | Postgres 16 + **pgvector** (HNSW, 384-dim) in the same DB; Drizzle ORM with a pre-commit guard that blocks the `sql\`… ANY(${array})\`` footgun in favor of typed `inArray()`. FK/status indexes on every hot path. |
| **Swappable design system** | A token-driven "**Meridian**" identity (bone paper, ink borders, offset hard-shadows, boxed mono course codes) with **light/dark + a 5-palette accent toggle** that applies before first paint (no flash). |

Decision records for all of the above live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## ✨ Features

### 📅 Planning
- **Drag-and-drop term planner** (@dnd-kit) — move courses across Fall 2026 → Winter 2030 with optimistic UI.
- **Real-time validation** — a pure-function rules engine flags prereq / coreq / term-offering violations live.
- **Workload predictor** — buckets each term *light / moderate / heavy / burnout* from community-rated hours, or a 2.5 hr/credit fallback.
- **Requirements checklist** — per-category progress against Concordia §71.70.9 with a degree-completion ring.
- **Transfer-credit lane** — a dedicated planner lane for CEGEP / advanced-standing credits.
- **Excel import** — parse a hand-curated Concordia plan with per-row checkboxes; routes transfers and milestones automatically.
- **PDF + .ics export** — printable plan + an iCalendar feed for Google/Apple calendars.

### 🤖 AI
- **Ask Compass** — streaming RAG chat over the catalog + your plan, multi-turn, with verifiable citations.
- **Smart recommendations** — eligibility filter → semantic similarity → 0–1 scoring → LLM picks the top 5 with a personalized "why".
- **AI Review** (on `/plan`) — proactive workload/sequencing suggestions, cached per plan-hash (reloads cost $0 tokens).
- **AI Insight of the Day**, **AI email drafting**, and a **⌘K** command palette with keyword + semantic search.

### 👥 Community
- **Course insights** — "What students are saying" summaries from **concordia.courses** → `old.reddit.com` JSON → Brave Search (budget-guarded), summarized by a LangGraph chain and cached 7 days.
- **Difficulty votes** + **anonymous professor reviews** (author name never returned for anon reviews).
- **Flag + moderation queue**, **public profiles** at `/u/[slug]` (with a dynamic OG image), and a no-auth **`/demo`** sandbox.

### 🔭 Production-grade plumbing
- **Better Auth** (email/password, Argon2id) with an **invite-only allowlist + admin approval** flow, plus per-IP auth rate limiting.
- **Sentry** (client/server/edge + source maps) and **PostHog** analytics (consent-gated, DNT-respecting).
- **GDPR controls** — one-click JSON export + soft-delete with a 30-day purge cron.

---

## 📸 Screenshots

> _Live captures coming soon._ In the meantime, see it running at the
> **[live demo](https://compasssoen1.up.railway.app)** or the no-auth
> **[`/demo` sandbox](https://compasssoen1.up.railway.app/demo)**.
>
> _Self-hosting? Drop PNGs into `docs/screenshots/` (`landing.png`, `dashboard.png`, `planner.png`,
> `chat.png`, `map.png`, `course.png`) and they'll render here._

---

## 🏠 Self-hosting

SOEN Compass is designed to run **end-to-end on free tiers** — the only thing you *need* is a free
Groq API key. Everything else (Gemini, OpenRouter, Sentry, PostHog, Reddit, Brave) is optional.

### Prerequisites
- **Node.js 22 LTS** (`nvm install 22`)
- **Docker + Docker Compose** (for local Postgres + pgvector)
- A free **[Groq API key](https://console.groq.com/keys)** (no credit card)

### Setup

```bash
git clone https://github.com/Sraldon24/CompassSoenDemo.git
cd CompassSoenDemo
nvm use 22
npm install

# Postgres + pgvector
npm run db:up
npm run db:migrate

# Seed the 124-course Concordia catalog + embeddings
npm run seed:catalog
npm run db:embed

# Env: copy the template, then set GROQ_API_KEY (the only required key)
cp .env.local.example .env.local

# Run it
npm run dev
```

Open **http://localhost:3000**, sign up, complete onboarding, and head to **/plan**.

> **Access control:** signup is open locally unless you set `ALLOWED_EMAILS` / `ADMIN_EMAIL` (then
> it's invite-only with admin approval at `/admin/users`). Set `ADMIN_EMAIL` to yourself to become
> the bootstrap admin.

> **Want a pre-filled demo account fast?**
> `npx tsx --import ./scripts/load-env.ts scripts/seed-demo-account.ts` creates an approved,
> onboarded `demo@compass.local` (password `DemoCompass!2026`); then
> `npm run seed:user-plan -- --email demo@compass.local` gives it a sample plan.

### Optional keys (all free, all degrade gracefully if unset)

| Key | Unlocks |
|---|---|
| `GEMINI_API_KEY` | Fast free chat fallback (else Groq 8B is used) |
| `OPENROUTER_API_KEY` | Last-resort AI fallback (`:free` models only, never-spend guarded) |
| `BRAVE_SEARCH_API_KEY` | Community-insight web fallback |
| `SENTRY_*` / `NEXT_PUBLIC_POSTHOG_KEY` | Error tracking + analytics |

Production deploy notes (Railway): see [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## 🧰 Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** App Router | RSC + Server Actions in one codebase |
| Language | **TypeScript 5** (strict, `noUncheckedIndexedAccess`) | Catch bugs at compile time |
| Styling | **Tailwind v4** + shadcn/ui + the Meridian token system | Atomic, accessible, themeable |
| DB | **Postgres 16 + pgvector** (HNSW) | $0, vector search in the same DB |
| ORM | **Drizzle** | Type-safe, no codegen daemon |
| Auth | **Better Auth** + invite allowlist + admin approval | Self-hosted, Argon2id, no lock-in |
| AI | **Groq** Llama 3.1 8B / 3.3 70B · **Gemini 2.5 Flash** · OpenRouter (free) | Fastest free inference, quality-first routing |
| Embeddings | sentence-transformers **all-MiniLM-L6-v2** (local) | $0, runs in Node, 384 dims |
| Agents | **LangGraph** | Multi-step recommend / email / summarize pipelines |
| Lint/format | **Biome** | One Rust binary, no ESLint/Prettier split |
| Testing | **Vitest** + **Playwright** | 388 tests passing |
| Fonts | **Bricolage Grotesque** · Hanken Grotesk · JetBrains Mono | Editorial display + mono numerics |
| Hosting | **Railway** | $5/mo credit covers app + Postgres |

**Total cost: $0/month** on free tiers.

---

## 🤖 AI request flow

```
User query
  └─ extract explicit course codes (regex)
  └─ buildRAGContext()
       ├─ force-include named courses (catalog row + prereqs + your plan status)
       ├─ embed query → pgvector cosine top-K (relevance-floored)
       └─ community (concordia.courses / Reddit) semantic top-K
  └─ router: simple → fast model · strategic → Groq 70B (8s first-token race)
  └─ fallback: Groq 70B → Gemini 2.5 Flash → Groq 8B → OpenRouter (free)
       with retry/backoff + 85% daily-quota circuit breaker
  └─ stream to client (+ "thinking…") · persist conversation · record usage
```

---

## 🧪 Testing

**388 tests passing** (Vitest unit + integration, Playwright E2E):

```bash
npm run test          # Vitest: unit + integration
npm run test:e2e      # Playwright: E2E
npm run lint          # Biome + a pre-commit SQL-pattern guard
npm run typecheck     # tsc --noEmit
```

Coverage spans the planner rules engine, workload predictor, recommend scoring, the API-envelope +
route guards, the AI fallback chain + never-spend guards, the community layer (sources, the
summarization graph incl. a prof-name-dedupe regression, difficulty aggregates, anonymous-review
privacy invariants, moderation, public-profile visibility, GDPR export/purge), and the pure
RAG-assembly relevance floor. Integration tests hit real Postgres + pgvector; Groq-heavy graph
tests are opt-in to stay under the free rate limit.

---

## 📂 Project structure

```
src/
├── app/
│   ├── (auth)/          # login, signup, onboarding, pending
│   ├── (dashboard)/     # dashboard, plan, map, requirements, chat, deadlines, emails, settings
│   ├── admin/           # users (approve/reject), moderation, scraped-changes
│   ├── api/             # ai/* (chat stream, recommend, review, draft-email), auth, search,
│   │                    #   import (excel), export (pdf/ics), courses/*, account, moderation
│   └── page.tsx         # marketing landing
├── components/          # ui/ (primitives) · planner · prereq-map · chat · dashboard · nav · providers
└── lib/                 # organized by domain:
    ├── ai/              # provider (router + fallback), graphs/ (LangGraph), rag, embeddings, prompts
    ├── auth/            # Better Auth, access-control (allowlist), get-session, is-admin
    ├── data/            # db, schema, repositories/, queries/
    ├── domain/          # prereq-graph, requirements, term, workload (pure)
    ├── community/       # concordia-courses, reddit, brave, summaries, moderation, reviews
    ├── limits/          # rate-limit + Groq quota
    └── api/             # response (envelope), route-guard (aiGuard + community guards)
```

---

## 🗺️ Roadmap

- **Phase 1 — Foundation** ✅ auth, DB, app shell, design system
- **Phase 2 — Core Planner** ✅ DnD, validation, workload, requirements, Excel import, onboarding
- **Phase 3 — AI + Polish** ✅ RAG chat, recommendations, prereq map, email drafting, exports
- **Phase 4 — Community + Launch** ✅ course insights, votes, reviews, moderation, public profiles, demo, Sentry/PostHog, GDPR, AI fallback chain
- **Live on Railway** ✅ invite-only, DB seeded. Post-launch: consistent API envelope, DB index pass, multi-turn chat, the Meridian redesign + accent toggle.

---

## 📜 License

[MIT](LICENSE) © 2026 Amir Ghadimi — use it freely for your own SOEN journey. A ⭐ is appreciated but never required.

## 🙏 Acknowledgments

Concordia's Gina Cody School calendar (authoritative course data) · the r/Concordia community ·
shadcn + Base UI · Vercel (Next.js) · Groq (fast free inference) · Hugging Face / Xenova
(the ONNX MiniLM build that runs embeddings in Node).

## ⚠️ Disclaimer

**Not affiliated with or endorsed by Concordia University.** Course data comes from public calendar
pages and a single student's hand-curated plan. Always verify with your academic advisor before
registering — AI answers can be wrong even when cited. Compass is a planning aid, not an authority.

---

<div align="center"><sub>Built with ☕ + 🤖 by a Concordia SOEN student, for Concordia SOEN students.</sub></div>
