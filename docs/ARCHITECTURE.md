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

**Status:** Accepted
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
