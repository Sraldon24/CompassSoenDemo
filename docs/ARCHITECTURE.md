# ARCHITECTURE.md

> Technical architecture and decision records for SOEN Compass.

This document captures **why** we made each major technical decision. Useful for:
- Recruiters reading the repo
- Future contributors understanding tradeoffs
- The author (me) remembering reasoning months later

> ⚠️ **This is a draft.** Claude Code will expand this with diagrams, code samples, and ADR entries as the system evolves.

---

## 📐 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       USER (Browser)                          │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 15 (App Router)                    │
│                       hosted on Railway                       │
│  ┌──────────────────┬──────────────────────────────────────┐│
│  │  Server          │  Client Components                    ││
│  │  Components      │  (interactive UI)                     ││
│  │  (default)       │                                       ││
│  ├──────────────────┴──────────────────────────────────────┤│
│  │              Server Actions + Route Handlers             ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
        ↓                ↓                ↓                ↓
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Postgres │    │   Groq   │    │  Gemini  │    │ Crawlee  │
│ +pgvector│    │ Llama 3.1│    │ Flash    │    │ Scraper  │
│ (Railway)│    │ +Llama   │    │ (free    │    │ (Railway │
│          │    │ 3.3 70B  │    │ fallback)│    │  Cron)   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                       ↓
                                              ┌──────────────┐
                                              │  Concordia   │
                                              │   Calendar   │
                                              │  + Reddit    │
                                              └──────────────┘
```

### Key principles

1. **Monolith for solo dev** — one Next.js app, one repo, one deployment
2. **Server-first** — RSC by default, Client Components when needed
3. **Type-safe end-to-end** — TypeScript strict + Drizzle + Zod
4. **Free infrastructure** — Railway Hobby + Groq + Gemini + open source
5. **Privacy by default** — no third-party tracking without consent, GDPR-style deletes
6. **Open source** — public repo, MIT license, transparent decisions

---

## 📋 Architecture Decision Records (ADRs)

### ADR-001: Next.js over NestJS

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need to pick a framework for both frontend (React UI) and backend (API, auth, data).

**Decision:** Use Next.js 15 monolith.

**Rationale:**
- One codebase = solo dev efficiency
- Server Components + Server Actions = real backend work in same file structure
- Railway natively supports Next.js deployment
- GitHub repo is more shareable (UI = visual demo)
- Modern resume signal (Next.js is trending in 2026)

**Considered alternatives:**
- NestJS + separate React frontend: rejected. Two codebases adds complexity without payoff for solo dev. Better suited for teams.
- Pure Express + React: rejected. Less modern, more boilerplate.
- Remix: viable but smaller ecosystem than Next.js.

**Consequences:**
- If we need to extract heavy compute (AI inference, scraping) into separate service later, we can — Next.js doesn't prevent it.
- Tied to Vercel-style patterns; if Next.js takes a bad turn, migration is harder than with a more vanilla stack.

---

### ADR-002: Drizzle over Prisma

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need an ORM for PostgreSQL with TypeScript-first ergonomics.

**Decision:** Use Drizzle ORM.

**Rationale:**
- Lighter than Prisma (no separate query engine binary)
- SQL-first — generated types match SQL behavior
- Better Edge Runtime support (smaller bundle)
- More flexible raw SQL escape hatch
- Drizzle Kit migrations are simple

**Considered alternatives:**
- Prisma: industry standard but heavier, slower queries, harder Edge support.
- Kysely: type-safe SQL builder, but more verbose for app dev.
- Raw SQL + types: too much manual work.

**Consequences:**
- Smaller community than Prisma — fewer Stack Overflow answers for edge cases.
- Bleeding-edge features (e.g., relations API) sometimes change.

---

### ADR-003: Better Auth over Clerk/NextAuth/Supabase

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need authentication with Google OAuth, sessions, user management.

**Decision:** Use Better Auth (self-hosted).

**Rationale:**
- Open source, no vendor lock-in
- Self-hosted = $0 forever
- Works perfectly with Drizzle + PostgreSQL
- Better TypeScript types than alternatives
- Modern API design (vs NextAuth's legacy patterns)
- Rapidly becoming the new default for Next.js auth in 2026

**Considered alternatives:**
- Clerk: great DX but $25+/mo at scale, vendor lock-in.
- NextAuth (Auth.js): legacy patterns, harder to type, more boilerplate.
- Supabase Auth: requires Supabase ecosystem (don't want lock-in).

**Consequences:**
- Newer library = smaller community, occasional API changes.
- Self-hosted = more responsibility for security best practices.

---

### ADR-004: Groq + Gemini hybrid for AI

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need AI inference for chatbot, recommendations, summaries. Budget = $0.

**Decision:** 3-tier routing:
1. Groq Llama 3.1 8B Instant (fast)
2. Groq Llama 3.3 70B Versatile (smart)
3. Gemini 2.0 Flash (fallback)

**Rationale:**
- Groq has best free tier (14,400 RPD per model, no credit card)
- Groq inference is 10x faster than competitors (LPU hardware)
- Gemini 2.0 Flash adds independent rate-limit pool (different quota)
- Both follow OpenAI SDK format — swap providers in 2 lines if needed
- All free for 100s of active users

**Considered alternatives:**
- OpenAI: best quality but $5+ deposit required, paid per token.
- Anthropic Claude: best quality but no permanent free tier.
- Local Ollama on Railway: free but slow (CPU only), eats 4-8GB RAM, ~$10/mo for hosting.

**Consequences:**
- If Groq changes free tier policy, must switch to paid or alt provider.
- Different model behaviors (Llama vs Gemini) — prompts must be tested on both.
- No support for vision/multimodal in free tier (acceptable for v1).

---

### ADR-005: pgvector over Pinecone for embeddings

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need vector storage for semantic search and RAG.

**Decision:** Use pgvector extension in our existing PostgreSQL.

**Rationale:**
- $0 cost (no separate Pinecone subscription)
- One database to manage (DB + vectors)
- HNSW indexes give sub-second search
- Transactional consistency (vectors and metadata in sync)
- 384-dim embeddings (sentence-transformers) = small and fast

**Considered alternatives:**
- Pinecone: $70+/mo for production tier.
- Weaviate: separate service to deploy.
- Qdrant: same as Weaviate, separate infra.
- In-memory + JSON: doesn't scale.

**Consequences:**
- Postgres needs pgvector extension installed (Railway supports it).
- At very large scale (>1M vectors), dedicated vector DB might be needed (not v1 concern).

---

### ADR-006: sentence-transformers (local) over OpenAI embeddings API

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need to embed text into vectors for semantic search.

**Decision:** Use `Xenova/all-MiniLM-L6-v2` locally via `@xenova/transformers`.

**Rationale:**
- $0 forever (runs in Node process)
- 80MB model, ~200MB RAM — fits Railway tier
- 384-dim embeddings — small storage cost
- Fast inference on CPU (~50ms per embed)
- No API key, no rate limits, no external dependency

**Considered alternatives:**
- OpenAI `text-embedding-3-small`: best quality but $0.02/1M tokens (still cheap but not free).
- Voyage AI: high quality but paid.
- Cohere: paid.

**Consequences:**
- Slightly lower embedding quality than OpenAI (acceptable for course search).
- Model loaded into Node process — first request has cold start (~500ms).

---

### ADR-007: Railway over Vercel

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need to host the Next.js app, Postgres DB, and Cron jobs.

**Decision:** Use Railway Hobby plan ($5/mo credit).

**Rationale:**
- User already has Railway account + familiarity
- Railway includes Postgres in same project
- Cron Services support long-running tasks (Vercel hobby has 10s timeout)
- $5 credit covers everything for v1 scale
- One dashboard, simpler mental model

**Considered alternatives:**
- Vercel + Supabase: more "standard" for Next.js, but two platforms to manage and Cron timeouts on hobby.
- Fly.io: viable but less polished UX.
- Self-host on VPS: too much ops overhead.

**Consequences:**
- Less Next.js-specific optimization than Vercel (no Edge Functions, no Image CDN by default).
- If Railway pricing changes, migration to Vercel/Fly is moderate effort.

---

### ADR-008: Crawlee over Playwright/Cheerio alone

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need to scrape Concordia calendar weekly.

**Decision:** Use Crawlee (TypeScript) which wraps Playwright + Cheerio.

**Rationale:**
- TypeScript-native (same language as app)
- Open source (Apache 2.0)
- Built-in anti-blocking, proxy rotation
- Adaptive crawler picks JS rendering vs static HTML automatically
- Request queues handle retries and pagination
- 22k+ GitHub stars — well-maintained

**Considered alternatives:**
- Raw Playwright: more code to write, no anti-blocking built-in.
- Raw Cheerio: no JS rendering for dynamic pages.
- Firecrawl: $16+/mo for API tier.
- Scrapy: Python-only, doesn't fit our stack.

**Consequences:**
- Crawlee abstraction sometimes hides Playwright/Cheerio details.
- Larger dependency footprint than minimal scraping.

---

### ADR-009: Community-owned reviews, not scraped from RateMyProfessors

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Want professor ratings/reviews in the app.

**Decision:** Build our own review system; link OUT to RateMyProfessors via search URL.

**Rationale:**
- RateMyProfessors ToS explicitly prohibits scraping.
- Scraping their content = legal risk + bad signal for recruiters reviewing the repo.
- Community-owned data = we control quality, moderation, format.
- Linking out gives users access to external data without violating ToS.

**Considered alternatives:**
- Scrape RateMyProfessors: rejected. ToS violation, legal liability.
- No reviews at all: rejected. High-value feature.
- Use only RateMyProfessors via embeds: limited control + still ToS-questionable.

**Consequences:**
- Cold start: no reviews until users contribute.
- Moderation burden falls on us.
- Different data than RateMyProfessors (could be confusing if users compare).

---

### ADR-010: Biome over ESLint + Prettier

**Status:** Accepted
**Date:** May 27, 2026

**Context:** Need linter + formatter for the project.

**Decision:** Use Biome.

**Rationale:**
- 10x faster than ESLint + Prettier
- Single config file (no duplication)
- Modern Rust-based implementation
- One tool to maintain
- Increasingly adopted in 2026

**Considered alternatives:**
- ESLint + Prettier: traditional standard, but slow + dual config.
- dprint: similar idea, smaller ecosystem.
- oxc: too early.

**Consequences:**
- Smaller ecosystem of plugins than ESLint.
- Some niche ESLint rules don't have Biome equivalents.

---

### ADR-011: lru-cache for rate limiting (in-memory)

**Status:** Accepted
**Date:** 2026-05-27

**Context:** Need to enforce per-user and per-IP rate limits on AI endpoints, search, imports, and moderation flags. v1 traffic is small (~100 users).

**Decision:** Use `lru-cache` for in-memory rate limiting on a single Railway replica.

**Rationale:**
- Zero infrastructure overhead — no Redis to provision, no extra cost.
- Fits the v1 deployment shape (single Railway replica, single process).
- `lru-cache` has a sliding-window-friendly API and is widely battle-tested.
- Trivial to swap for Redis (`@upstash/ratelimit` or similar) when we scale.

**Considered alternatives:**
- Redis (Upstash free tier): would work, but adds a dependency we don't need for 100 users.
- Postgres-backed rate limiting: avoids new infra, but every check is a DB round-trip.
- No rate limiting: rejected — AI endpoints would burn the Groq free tier in hours under abuse.

**Consequences:**
- Limits reset on process restart (acceptable for v1; users can't game it meaningfully because daily limits persist in `aiUsage` table separately).
- **Breaks if we scale to multiple Railway replicas.** Tracked as known tech debt — when multi-replica is needed, swap to Redis. Until then, keep deployment to a single replica.

---

### ADR-012: Groq-only AI provider for v1 (Gemini fallback deferred)

**Status:** Superseded by ADR-016 (2026-06-04)
**Date:** 2026-05-27
**Supersedes part of:** ADR-004

**Context:** ADR-004 specified a 3-tier routing strategy (Groq fast → Groq smart → Gemini fallback). The Gemini fallback adds an extra SDK, env var, and prompt-divergence testing surface. For v1 with ~100 users, the Groq free tier (28,800 RPD across two models) is significantly more capacity than realistic usage.

**Decision:** Ship Groq-only for v1. On Groq 429, retry with exponential backoff (3 attempts at 1s/2s/4s). If all retries fail, surface 503 to the caller with a friendly UI message.

**Rationale:**
- The complexity cost of maintaining two providers (different prompt behavior, two rate-limit pools to track, two SDKs to keep updated) is not justified at v1 scale.
- Groq's free tier is generous enough that 429s should be rare even at peak r/Concordia launch traffic.
- The 50/day/user cap (PRD §19.2) is enforced *before* the Groq call, so abuse is bounded.
- `.env.local.example` keeps the `GEMINI_API_KEY` slot as a commented placeholder so re-enabling is a small refactor, not a rewrite.

**Considered alternatives:**
- Original 3-tier (Groq + Gemini): keeps headroom but doubles maintenance burden for v1.
- Switch to OpenAI/Anthropic paid tier on 429: violates the $0/month constraint.
- Cache common AI responses aggressively: planned independently (Reddit summaries cached 7 days per PRD §4.11.5), but not a substitute for rate-limit resilience.

**Consequences:**
- **Single-provider risk acknowledged:** if Groq has a sustained outage or changes their free tier, the AI features go down. Mitigation is the retry+backoff + 503 UI fallback.
- Re-enabling Gemini later is a contained refactor (one file: `lib/ai/provider.ts`).
- Document a SLO target post-launch: "AI features available ≥99% of the time"; if we breach it, that's the trigger to add Gemini.

---

### ADR-013: `inArray()` over raw `sql\`... ANY(${array})\`` for parametrized lists

**Status:** Accepted
**Date:** 2026-05-28
**Context:** During live AI integration testing in Phase 3, two endpoints (`/api/ai/chat` and the planner snapshot query) crashed with Postgres error `op ANY/ALL (array) requires array on right side`. Root cause: Drizzle's `sql\` tag splits each element of a JS array into its own placeholder when used inside `ANY()` / `IN()`. The query that looks like `code = ANY(${codes})` compiles to `code = ANY(($1, $2, $3))` — invalid SQL.

**Decision:** Always use Drizzle's typed `inArray(column, jsArray)` helper for list-membership queries. Reserve raw `sql\` tags for things Drizzle's API can't express (HNSW vector search, JSON path queries, raw aggregates).

**Rationale:**
- Drizzle's `inArray()` correctly binds the array as a single `text[]` parameter.
- Type-safe — the column type must match the array element type at compile time.
- This bug class is invisible to TypeScript (the raw `sql\` tag returns `SQL<unknown>`), so we need a runtime + lint-level guard, not just a type check.

**Implementation:**
- Pre-commit guard at `scripts/check-sql-patterns.sh` greps for `sql\`...ANY\(\${...}` and `sql\`...IN \(\${...}` patterns. Wired into `npm run lint`.
- Integration tests in `tests/integration/db-queries.test.ts` include a regression case that exercises `inArray` with a 3-element array to prove the pattern stays correct.

**Consequences:**
- One more script to maintain (~30 LOC, shell).
- Future contributors who reach for `sql\`... ANY(${...})\`` get a clear error before committing.

---

### ADR-014: RAG context force-includes explicitly-mentioned courses

**Status:** Accepted
**Date:** 2026-05-28
**Context:** Early Phase 3 live-testing showed that when a user asked "When can I take COMP 472?", the RAG pipeline's pure semantic search did not always surface COMP 472's catalog entry in the top-K context. Cosine similarity matched broader concepts (e.g. AI / ML courses) but missed the specific entry. The LLM, correctly refusing to invent prereqs, answered "I don't have that information."

**Decision:** Before semantic search, regex-extract any course codes from the query (`/\b([A-Z]{3,4})\s*(\d{3})\b/g`) and force-include their full catalog row in the RAG context as a separate "Courses you explicitly mentioned" block, with `[E1]/[E2]/...` citation labels. Semantic search runs over the catalog *minus* those explicit codes to maximize unique signal.

**Rationale:**
- The user naming a code is the strongest possible signal of relevance. Pure embedding similarity buries it under thematically-related courses.
- This is a small, deterministic pre-step — adds <10ms.
- The LLM gets prereqs, credits, category, and the user's plan status for the named course in the system prompt. Quality of answer jumps from "I don't have that info" to a correct, cited response.

**Considered alternatives:**
- Higher top-K cutoff: increases context length without solving the core ranking issue.
- Re-rank embeddings with a small LLM pass: more latency, marginal gain.
- Train a domain-specific embedder: massive overkill for the use case.

**Consequences:**
- Two label namespaces in citations (`[E1]` explicit, `[1]/[2]` semantic). UI renders them as distinct chips.
- A query like "tell me about COMP 999" will force-include the non-existent code — the catalog lookup returns empty, so no harm done.

---

### ADR-015: Course catalog seeded from Concordia §71.70.10 (not the scraper)

**Status:** Accepted
**Date:** 2026-05-28
**Supersedes part of:** ADR-008 (scope, not the tool choice)
**Context:** ADR-008 specified Crawlee as the catalog source for Phase 4 onwards. v1 needed catalog data **immediately** to power the planner, recommendations, and prereq map. Writing the scraper-with-admin-review-queue first would have blocked Phases 2+3.

**Decision:** For v1, seed the catalog from two sources:
1. The user's hand-curated Excel (`data/seed/courses.json` — 61 courses he has personally verified)
2. A supplementary JSON (`data/seed/courses-supplementary.json` — 113 courses extracted from Concordia 2025-26 calendar §71.70.9 + §71.70.10 via WebFetch)

Total: **124 courses** with prereqs, credits, categories. Seeded into Postgres via `npm run seed:catalog`, then embedded via `npm run db:embed`.

**Rationale:**
- Authoritative source (the official calendar) without the engineering cost of a scraper.
- Hand-curated user plan gives us better prereq accuracy than auto-parsing the calendar's prose.
- Idempotent — re-running the seed updates rows on conflict but never duplicates.
- The Phase 4 scraper still ships per ADR-008, but as an *update* mechanism, not the initial bootstrap.

**Consequences:**
- Catalog drifts if Concordia updates §71.70.10 between v1 and Phase 4. Mitigation: PRD §15 admin-review queue.
- Manual review of `courses-supplementary.json` before commit caught at least one ambiguity (ENGR 245 / MIAE 221 as Eng & Nat Sci Group alternatives — both are valid).
- Removing 17 stale courses or fixing a wrong credit value requires editing the JSON, not the DB directly.

---

### ADR-016: Gemini 2.5 Flash for fast chat + OpenRouter free fallback (formalized)

**Status:** Accepted
**Date:** 2026-06-04
**Supersedes:** ADR-012 (and the "Groq-only, no Gemini" constraint as stated in earlier docs)

**Context:** ADR-012 deferred Gemini and shipped Groq-only with retry+backoff. In practice the AI layer evolved past that during the AI/speed work: the streaming chat path now races Groq 70B against a fast model, and OpenRouter free models were added as a cross-provider fallback for the non-streaming path. A backend audit (2026-06) surfaced that the code contradicted the documented "Groq-only, no Gemini" constraint. Rather than rip out a working, free-tier path, we formalize the real architecture.

**Decision:** The AI provider is a **layered, all-free chain**, not single-provider:

1. **Streaming chat** (`streamChatWithFallback`): quality-first race — start Groq **70B**, and if it hasn't produced a first token within ~8s (or the 70B daily quota is throttled, or the query is a simple lookup), stream from the **fast model**: **Gemini 2.5 Flash** (Google AI Studio free tier) when `GEMINI_API_KEY` is set, else Groq **8B-instant**. The served model is recorded accurately in `ai_usage` / `ai_messages` (enum includes `gemini-2.5-flash`).
2. **Non-streaming** (`generateResponse`, used by recommend/email/review/insight/summarize): Groq selected model → Groq 8B downgrade → **OpenRouter free models** (`:free` only, never-spend guards per ADR/`project-openrouter-never-spend`). Network errors (no HTTP status) are treated as retryable so transient blips fall through the chain instead of hard-failing.

**Rationale:**
- Gemini 2.5 Flash is genuinely free (AI Studio tier), fast (~1.2s first token), and independent of Groq's quota — it directly serves the PRD's "<2s first token" budget on the most-used surface (chat).
- OpenRouter's `:free` tier (unlocked by a $5 credit that is **never spent** — three guards) gives real cross-provider resilience for the batch paths when Groq throttles, at $0/mo.
- All three providers are free; the $0/month constraint is preserved. The only constraint relaxed is the *literal* "no Gemini" wording, which was already false in code.

**Constraints that still hold:**
- **No paid APIs.** No OpenAI/Anthropic direct calls. OpenRouter is `:free`-only with an allowlist + per-process balance pre-flight + dashboard cap; the $5 credit must never be drawn down.
- Groq remains the primary/quality model (70B) for chat and the batch paths.

**Consequences:**
- Adds `@ai-sdk/google` as a (free-tier) dependency on the chat hot path — accepted.
- Three model behaviors to keep prompts robust against (Llama 70B/8B, Gemini, OpenRouter free models). Prompts are written provider-agnostic.
- `.env.local.example` documents `GEMINI_API_KEY` and `OPENROUTER_API_KEY` as optional; the app still runs Groq-only if neither is set (graceful degradation).
- The OpenRouter free-model slug list drifts upstream; the rotation falls through 404s, so a stale entry degrades gracefully rather than breaking the fallback. Verified against the live `/models` catalog on 2026-06.

---

### ADR-017: "Meridian" design system (token-driven, swappable accent)

**Status:** Accepted
**Date:** 2026-06-05
**Supersedes:** the earlier "Graphite Greens" / Lumen design systems (their token *names* live on as aliases)

**Context:** The UI went through three looks: the original Graphite Greens (`docs/design/HANDOFF.md`), a "Lumen" reskin, and a "solid" pass. A fresh Claude Design handoff bundle proposed **Meridian** — a warm editorial-almanac identity — as a total rethink. We adopted it as the canonical design system.

**Decision:** Implement **Meridian** as the single design language, driven entirely by CSS custom properties in `src/app/globals.css`:
- **Palette:** warm "bone paper" canvas (`--paper`/`--surface`), confident ink text/borders (`--ink`, `--line`/`--line-strong`), and **offset hard-shadows** (`--hard-shadow`) instead of soft floating cards — a risograph/print feel.
- **Accent:** **Clementine** (orange) default, with a **5-palette runtime toggle** (Clementine/Cobalt/Moss/Plum/Maroon) via a `data-accent` attribute on `<html>`, persisted to `localStorage` and applied by a tiny no-flash bootstrap script before first paint. Each palette has light + (brightened) dark variants.
- **Type:** Bricolage Grotesque (display), Hanken Grotesk (UI), JetBrains Mono (course codes + numerics) via `next/font`.
- **Primitives:** `Button`/`Card`/`Badge` reskinned to the print feel; a boxed-mono `CourseCode` chip; utility classes `.card`/`.card-hard`/`.eyebrow`/`.chip-code`/`.lift`.
- **Light/dark** via next-themes `.dark` (Meridian tokens also respond to `data-theme="dark"`).

**Rationale:**
- Token-driven means the whole app re-themes from one file; **every legacy token name (`--color-*`, `--gradient-*`, `--shadow-*`) is aliased** to a Meridian value, so the migration touched markup only where the *signature* treatment (boxed codes, hard-shadows, eyebrow kickers) needed bespoke layout.
- The accent toggle was a cheap add (CSS `[data-accent]` blocks + a 30-line picker) and lets each self-hoster pick a look.

**Consequences:**
- `docs/design/HANDOFF.md` and the PRD §8 design tables are **historical** — `globals.css` is the source of truth.
- New UI should use Meridian tokens/classes (ink borders, `.card-hard`, `.eyebrow`, `<CourseCode>`, Bricolage headings); never hardcode hex except text on accent fills.
- Adding a 6th accent palette = one `[data-accent="…"]` block (light + dark) + one entry in the picker's `ACCENTS` array.

---

## 🗂️ Data Flow Diagrams

### User adds a course to plan

```
User drags COMP 352 to Winter 2027
    ↓
Client: optimistic UI update (instant)
    ↓
Server Action: addCourseToPlan(userId, courseCode, term)
    ↓
DB: INSERT INTO user_courses
    ↓
Server Action: validatePlan(userId)
    ↓
Return validation issues (if any)
    ↓
Client: shows warning if prereq violation
```

### Ask Compass AI query

```
User types: "When can I take COMP 472?"
    ↓
Server Action: /api/ai/chat (streaming SSE)
    ↓
Rate limit check (50/day per user)
    ↓
Embed query: sentence-transformers (~50ms)
    ↓
Vector search: pgvector cosine similarity (~100ms)
    ↓
Build RAG context: top 5 courses + top 5 Reddit posts
    ↓
Call Groq Llama 3.3 70B with context
    ↓ (or fallback to Gemini Flash on 429)
Stream tokens to client (~200ms first token)
    ↓
Save full conversation to aiConversations + aiMessages
    ↓
Update aiUsage table
```

### Weekly course scrape

```
Sunday 3am UTC
    ↓
Railway Cron Service triggers
    ↓
Run: npm run scrape:courses
    ↓
Crawlee PlaywrightCrawler visits Concordia §71.70.10
    ↓
Extract course data: code, title, prereqs, description
    ↓
Parse prereq text → structured JSON
    ↓
Diff against current courses table
    ↓
Insert changes to scrapedChanges (status: pending)
    ↓
Generate new embeddings for changed courses
    ↓
Admin reviews at /admin/scraped-changes
    ↓
Approve → updates courses table + courseEmbeddings
```

---

## 🔐 Security Model

### Authentication
- Google OAuth via Better Auth
- Sessions stored in DB (not JWT) — instant revocation
- HttpOnly cookies, SameSite=Lax, Secure in production

### Authorization
- Middleware checks session for protected routes
- Server Actions check `auth.api.getSession()` before mutations
- Admin role check (`user.role === 'admin'`) for admin routes

### Data isolation
- All queries filter by `userId` from session
- No row-level security in DB (Better Auth doesn't use it)
- Public profile data explicitly opt-in (`profile.isPublic`)

### Anti-abuse
- Rate limiting on all public endpoints
- IP-based limits for unauthenticated demo mode
- Content moderation queue for community submissions
- Profanity filter on submit

### Secrets
- All secrets in `.env` (gitignored)
- Production secrets in Railway env vars
- `BETTER_AUTH_SECRET` rotated periodically

---

## 📈 Scalability Considerations

### Current scale (v1 target: 100 users)
- Single Railway service handles everything
- 8GB RAM is plenty
- Postgres on Railway scales to ~10K active users before sharding needed

### When to scale (10K+ users)
- Move embeddings generation to separate worker (Railway Cron Service)
- Add Redis for distributed rate limiting (replace lru-cache)
- Consider CDN for static assets (Cloudflare)
- Move scraping to dedicated worker pool

### When to extract services (50K+ users)
- AI inference → separate NestJS microservice (or stay with Groq API)
- Scraping pipeline → independent service
- Public profile rendering → static generation with revalidation

### Database scaling
- pgvector indexes (HNSW) scale to millions of vectors
- Postgres on Railway scales vertically up to 32GB RAM
- Read replicas for analytics queries

---

## 🐛 Known Limitations / Tech Debt

### v1 acceptable limitations

- **No real-time collaboration** — single-user plans only. Could add later via Yjs or LiveBlocks.
- **No mobile native app** — PWA later. Web-responsive only for v1.
- **In-memory rate limiting** — works for single Railway instance but breaks if multi-replica. Move to Redis when scaling.
- **No advanced search filters** — search is keyword/semantic only. Faceted search (by credits, term, etc.) is v2.
- **English only** — Concordia is bilingual but we ship English first.
- **No offline mode** — requires internet. Service worker + IndexedDB for offline could be v2.

### Tech debt to address post-MVP

- [ ] Migrate `aiUsage` aggregation to materialized view (faster daily limit checks)
- [ ] Add Redis rate limiter when multi-replica needed
- [ ] Implement proper background job system (currently Server Actions)
- [ ] Add OpenTelemetry tracing (Sentry covers errors but not full traces)
- [ ] Audit and optimize bundle size (Next.js Bundle Analyzer)
- [ ] Add E2E test coverage to 80%+
- [ ] Internationalization (French support for Concordia bilingual students)

---

## 🔮 Future Roadmap (post-v1)

### v2 (Months 3-6 after launch)
- Mobile PWA with offline support
- French language support
- Course difficulty ML model (predict based on user grades pattern)
- Integration with Concordia Schedule Builder
- Calendar export improvements (recurrence rules)
- Email notifications for deadlines
- LeetCode tracker integration (for Co-op prep)

### v3 (Year 2)
- Multi-program support (COMP, COEN, ELEC, MIAE)
- Peer matching for study groups
- Discord bot integration
- Mobile native apps (React Native)
- AI tutoring (course-specific Q&A)

---

## 📚 References

- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Drizzle ORM docs](https://orm.drizzle.team/docs)
- [Better Auth docs](https://better-auth.com/docs)
- [Groq API docs](https://console.groq.com/docs)
- [pgvector README](https://github.com/pgvector/pgvector)
- [Crawlee docs](https://crawlee.dev/)
- [shadcn/ui docs](https://ui.shadcn.com/docs)

---

> *Built with care by a Concordia student learning while shipping.* 🛠️
