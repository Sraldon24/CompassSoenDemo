# REFACTOR.md — architecture deepening log

> Log of the "deep module" architecture refactor (Ousterhout: small interface
> hiding a large implementation; more testable; more AI-navigable). One section
> per cluster. Scope: **Phase 1–3 committed code only** (Phase 4 community/
> scraping is in progress and excluded).
>
> Driven by two parallel Explore passes (AI+DB layer, planner/validation core)
> that surfaced 6 friction clusters. Each cluster: frame → 3 parallel interface
> designs (minimal / flexible / common-caller) → user picks → implement → verify
> green (`tsc` + `biome` + SQL guard + `vitest`).

## Status

| # | Cluster | Status |
|---|---------|--------|
| 3 | Term module | ✅ Done |
| 4 | Excel import engine | ✅ Done |
| 5 | Embedder port | ✅ Done |
| 1 | LLM provider port | ✅ Done |
| 2 | DB repositories | ✅ Done (Phase-1 slice; later phases deferred) |
| 6 | Unified limiter facade | ✅ Done (all 4 phases) |

Order is dependency-driven: Term feeds Excel; repositories feed graphs/routes;
LLM + Embedder ports make the AI layer testable; the limiter facade sits on top.

---

## Cluster #3 — Term module ✅

**Problem:** the "term" concept (`"Fall 2026"`) was reimplemented across 7 files
with ~5 divergent parse/order implementations and 5+ copies of the
`^(Fall|Winter|Summer)\s+\d{4}$` regex. Two ordinal formulas existed
(`year*10` in validation, `year*3` in `termRange`) — both monotonic but a latent
inconsistency. Two `groupByTerm` copies (validation exported+tested; pdf private,
with a status filter the other lacked).

**Design chosen:** "common-caller" (Design C) + grafts. Plain pure functions
tuned to the real callsites — matches the codebase idiom (exported pure fns,
null-on-failure, Zod schemas) rather than introducing a `Term` class (Design A)
or a 16-export speculative toolkit (Design B). Grafts: optional `keep` predicate
on `groupByTerm` (from B, absorbs pdf's status filter); guarded
`isTermBefore`/`isSameTerm` so the `-Infinity` sentinel from raw-string
`termOrdinal` is never a footgun.

**New file:** `src/lib/term.ts` (171 LOC) — single source of truth.
Public surface:
- `parseTerm(label)` — case-insensitive, `TermLabel | null`
- `TERM_REGEX` / `termSchema` — strict case-sensitive guard for user input (Zod)
- `termYear(label)` — lenient 4-digit extractor (import path)
- `termOrdinal(TermLabel | string)`, `isTermBefore`, `isSameTerm` — ordering
- `termRange(start, end)` — inclusive chronological label list
- `sortTerms(labels)` — chronological sort
- `groupByTerm(items, keep?)` — generic over `{ term: string }`, optional filter
- `formatTerm(season, year)`, `termToStartDate(label)` — calendar mapping
- types: `TermSeason`, `TermLabel`

**Files modified (callsites collapsed):**
- `src/lib/validation/plan.ts` — deleted local `TERM_ORDER`/`parseTermLabel`/
  `termOrdinal`/`isBefore`/`isConcurrent`/`groupByTerm` (~50 LOC). Now imports
  from `@/lib/term` and **re-exports** `parseTermLabel` (alias of `parseTerm`),
  `termOrdinal`, `groupByTerm`, `TermLabel`, `TermSeason` for back-compat.
- `src/lib/db/queries/plan.ts` — deleted 32-LOC `termRange` (with its own inline
  parse + ordinal); re-exports `termRange` from `@/lib/term` to keep the import
  path stable for `plan/page.tsx`.
- `src/lib/exports/ics.ts` — deleted `TERM_START_DATES` + `termToStartDate`;
  re-exports `termToStartDate` from `@/lib/term`.
- `src/lib/exports/pdf.tsx` — deleted private `groupByTerm` + `sortTerms` +
  `TERM_ORDER` (~25 LOC); uses shared `groupByTerm(plan, isActive)` + `sortTerms`.
- `src/app/api/import/excel/route.ts` — deleted local `termYear`; uses
  `TERM_REGEX` + `termYear` from `@/lib/term`.
- `src/app/(dashboard)/plan/actions.ts` — `moveSchema` uses `TERM_REGEX`; `year`
  derived via `termYear` instead of an inline regex.
- `src/app/(auth)/onboarding/actions.ts` — `entryTerm` uses `TERM_REGEX`.

**Deliberate exception:** `scripts/parse-excel.ts` keeps its local `termYear`.
It's a standalone build-time script run via `tsx` and no script currently relies
on the `@/` path alias; importing `@/lib/term` (which pulls in `zod`) for one
private helper adds runtime risk for marginal gain. Revisit if scripts adopt the
alias.

**Tests:**
- New `tests/unit/term.test.ts` — 16 tests covering parse (case-insensitivity),
  strict `TERM_REGEX`, ordering + guards, lenient `termYear`, `termRange`
  rollover/reversed/unparseable, `sortTerms`, `groupByTerm` + filter,
  `termToStartDate`.
- `tests/unit/plan.test.ts` — **unchanged, still passes** (asserts only relative
  ordinal monotonicity, so the `*10`→`*3` unification is safe; `parseTermLabel`
  still returns `{ raw, season, year }`).

**Verification:** `tsc --noEmit` clean · `biome check` clean · SQL guard clean ·
`vitest run tests/unit` → **192 passed** (was 176; +16 term tests). No inline
season regex remains anywhere in `src/`.

**Net:** ~107 LOC of duplicated term logic across 6 files collapsed into one
171-LOC tested module + thin re-exports. One ordinal formula, one regex, one
`groupByTerm`.

---

## Cluster #4 — Excel import engine ✅

**Problem:** `src/app/api/import/excel/route.ts` (~210 LOC) mixed three concerns
in `POST` + `parseWorkbook`: (1) XLSX parsing, (2) format/catalog validation
(`statusFromString`, course-code regex, term regex), (3) HTTP + DB (auth,
rate-limit, 5 MB cap, transaction wipe-and-replace, importJobs). `parseWorkbook`
was effectively pure but untestable because the file dragged in `db`/`getSession`/
`NextResponse`. `statusFromString`, `cellStr`, and the course-code regex were
duplicated with `scripts/parse-excel.ts` (5 regex copies total).

**Design chosen:** "flexible/B (safe slice)" — extract a pure engine + a shared
course-code primitives module; route keeps the I/O boundary; the catalog set is
passed into the engine as a param so it stays pure (preserving the "catalog
check only when format is clean" precedence).

**New files:**
- `src/lib/courses/code.ts` — `UserCourseStatus`, `COURSE_CODE_STRICT/GLOBAL`,
  `isCourseCode`, `extractCourseCodes`, `cellStr`, `statusFromString`. Pure leaf.
- `src/lib/imports/excel-engine.ts` — `parseExcelPlan(buffer, knownCodes): ImportRow[]`
  (sync, pure; `XLSX.read` runs on the buffer). Uses `TERM_REGEX`/`termYear` from
  `@/lib/term` — no reintroduced term regex.

**Files modified:**
- `src/app/api/import/excel/route.ts` — deleted local `cellStr`/`statusFromString`/
  `ImportRow`/`parseWorkbook` (~90 LOC). `POST` now: auth → rate-limit → size cap →
  `parseExcelPlan(buf, validCodes)` → persist. **HTTP contract unchanged**:
  preview/commit modes, 401/413/400/429/500, `{total,ok,errored,rows}` and
  `{jobId,imported}` shapes, `skipErrors`, and the `db.transaction` wipe-replace
  all preserved. Route ~210 → ~120 LOC.

**Deliberate exception:** `scripts/parse-excel.ts` keeps its own `cellStr`/
`statusFromString`/regex copies (standalone `tsx` script; `@/` alias-import risk,
same rationale as the Term exception). A comment could point at the canonical home.

**Tests:**
- `tests/unit/course-code.test.ts` — **new**, helpers (code validation, extraction,
  cell coercion, status mapping).
- `tests/unit/excel-engine.test.ts` — **new**, fabricates workbooks via
  `XLSX.utils.aoa_to_sheet` and feeds buffers to `parseExcelPlan`: valid rows,
  bad code, bad term, not-in-catalog, error-precedence (catalog suppressed when
  format invalid), blank-code skip, first-sheet fallback, empty workbook. No DB,
  no HTTP.

**Verification:** `tsc` clean · `biome` clean · SQL guard clean ·
`vitest run tests/unit` → **208 passed** (was 192; +16 engine/code tests).

---

## Cluster #5 — Embedder port ✅

**Problem:** `embeddings.ts` was a module-level singleton with `Xenova/all-MiniLM-L6-v2`
hardcoded and a late dynamic `import("@xenova/transformers")` that couldn't be mocked
cleanly; every RAG/recommend test paid the ~500ms model cold-start (so they were all
gated behind integration + a real key).

**Design chosen:** Option C — keep the free functions + singleton idiom, add a
test-only `setEmbedder()` seam. **Zero production call-site changes.**

**New files:**
- `src/lib/ai/embedder.ts` — `Embedder` interface + `EMBEDDING` const.
- `src/lib/ai/embedder.xenova.ts` — `createXenovaEmbedder()`; the ONLY importer of
  `@xenova/transformers` (lazy `getPipeline`).
- `src/lib/ai/embedders/fake.ts` — `createFakeEmbedder()`; deterministic, L2-normalized
  384-dim vectors from a hashed seed (mulberry32 PRNG). No model, no network.

**Files modified:**
- `src/lib/ai/embeddings.ts` — public surface preserved (`embed`/`embedBatch`/
  `warmEmbeddings`/`EMBEDDING`). Now delegates to a swappable `active` embedder
  (defaults to the real Xenova adapter, lazily). Adds `setEmbedder(e | null)`.

**Tests:** `tests/unit/embedder.test.ts` (new, 5) — injects the fake via `setEmbedder`
in `beforeAll`, resets in `afterAll`. Asserts dimension, determinism, distinctness,
unit-length normalization, batch order/empty. Runs with **no `@xenova` load**.

**Verification:** `tsc` clean · `biome` clean · `@xenova/transformers` now imported
in exactly one module · `vitest run tests/unit` → **213 passed**.

---

## Cluster #1 — LLM provider port ✅

**Problem:** `provider.ts` hardcoded `groq()`; retry/backoff + the quota circuit
breaker were only exercisable via integration tests with a real `GROQ_API_KEY`
(`describe.skipIf`). Re-enabling Gemini (ADR-012) implied a rewrite.

**Design chosen:** Option A (pragmatic variant) — a thin `LlmProvider` port over the
**non-streaming round-trip** (where retry/backoff/quota live and are the real test
target), injected behind the unchanged `generateResponse` signature via a
`_set/_resetLlmProviderForTesting` hook. **`streamResponse` left as-is** — its
`ReturnType<typeof streamText>` is the chat route's contract (`stream.textStream`),
so the streaming path stays on the Vercel SDK directly (no contract change).

**New files:**
- `src/lib/ai/llm-port.ts` — `LlmProvider` (`generate(input) → {text, usage}`) + input/result types.
- `src/lib/ai/providers/groq-provider.ts` — real adapter (`maxRetries: 0`; provider.ts owns retry).
- `src/lib/ai/providers/fake-provider.ts` — programmable 429/500 throws shaped exactly
  like Groq errors (`status` + `retry-after` header) so the REAL `isRetryable`/
  `retryAfterMsFromError`/`statusOf` helpers run unchanged.

**Files modified:**
- `src/lib/ai/provider.ts` — `generateResponse` now calls `activeProvider.generate(...)`
  inside the existing retry loop; `selectModel`/`streamResponse`/`AIError` and the
  503/429 surface + circuit breaker all unchanged. Added the test hooks.

**Tests:** `tests/unit/ai-provider.test.ts` (new, 7) — selectModel routing; 429→retry→
success (honoring Retry-After); 429-exhaustion → AIError 429; 500→503; non-retryable
400 (no retry); and the **≥85% circuit breaker** trips before the provider is called.
All keyless.

**Verification:** `tsc` clean · `biome` clean · SQL guard clean · `@ai-sdk/groq`
isolated to `groq-provider.ts` (generate) + `provider.ts` (streaming) ·
`vitest run tests/unit` → **226 passed** (was 208; +5 embedder, +7 provider, +6 from #5/#1 combined count).

**Gemini later:** add `providers/gemini-provider.ts` implementing `LlmProvider`; the
port shape is already provider-neutral.

---

## Cluster #2 — DB repositories (Phase 1 slice) ✅

**Decision:** Option B (per-aggregate factories + default singletons), but only
the **lowest-risk first phase**, and **without PGLite** (no new dependency —
interface-mockable for logic; existing real-Postgres integration tests are the
regression net). Later phases (Profile/ImportJob/AiUsage/Search repos; slimming
onboarding/plan actions, rag.ts, recommend-graph) are deferred. Community/scraping
repos are **out of scope** — those files are Phase 4 (untracked, in progress).

**New files:**
- `src/lib/repositories/types.ts` — the seam: `DbHandle`, `Tx`, `Executor`.
- `src/lib/repositories/course-catalog-repo.ts` — `CourseCatalogRepository`
  (`findAll`, `findByCodes` via `inArray` per ADR-013) + `makeCourseCatalogRepository(db)`
  + `courseCatalogRepo` singleton + the row→entry mapper.
- `src/lib/repositories/plan-repo.ts` — `PlanRepository` (`getSnapshot`) +
  `makePlanRepository(db)` + `planRepo` singleton; owns `UserPlanRow`/`UserPlanSnapshotWithIds`.

**Files modified:**
- `src/lib/db/queries/plan.ts` — now a thin shim: `getUserPlanSnapshot` →
  `planRepo.getSnapshot`, `getAllCourses` → `courseCatalogRepo.findAll`, re-exports
  the snapshot types and `termRange`. **All 8 consumers (dashboard, plan, map,
  requirements pages + pdf/ics export routes + ai-insight) and the import path are
  unchanged.**

**Tests:** none changed. `tests/integration/db-queries.test.ts` +
`requirements.test.ts` exercise the shim against real Postgres and prove parity.

**Verification:** `tsc` clean · `biome` clean · `vitest run tests/unit` → 226 passed ·
integration `db-queries` + `requirements` → **10 passed** (real Postgres, through the repos).

**Future phases (when wanted):** Profile/ImportJob/AiUsage repos + slim
onboarding/plan actions, import route, rag.ts, recommend-graph; SearchRepository
to confine pgvector raw SQL; optionally PGLite for fast hermetic repo tests.

---

## Cluster #6 — Unified limiter facade ✅

**Decision:** Option B (`Limiter` + injectable `LimitStore`), public surface kept to
A's two functions (`guardAiCall`/`withUsage`). Per user direction, applied across
**all 4 phases** — including the untracked Phase 4 community/moderation routes.

**Problem:** three uncoordinated limiters (`rate-limit.ts` LRU, `groq-quota.ts`
system quota, `ai/usage.ts` DB ledger) hand-wired per route; the system-quota check
only lived inside `provider.ts`; `recommend`/`draft-email` recorded usage as the last
`try` statement, so a graph throw skipped the ledger silently; `chatUsageToday` was
dead code; the LRU was a hard singleton (no Redis seam, ADR-011 debt).

**New files (`src/lib/limits/`):**
- `config.ts` — `LIMITS` (single source; `rate-limit.ts` now re-exports it).
- `store.ts` — `LimitStore` interface (timestamp-list ops → sliding window byte-identical).
- `memory-store.ts` — `MemoryLimitStore` (lru-cache, immutable pushHit). Redis = future adapter.
- `limiter.ts` — `Limiter` (injectable store + `QuotaSource` + clock): `guardAiCall`
  (per-user/IP window + system breaker in one call) and `withUsage` (records the
  `aiUsage` row in a `finally` — **on success AND throw**, guarded, then re-throws).
- `index.ts` — default wiring + bound `guardAiCall`/`withUsage` + `denyResponse`
  (the shared 429/503 + Retry-After envelope) + `_resetLimitsForTesting`.

**Files modified:**
- `src/lib/rate-limit.ts` — `LIMITS` re-exported from `config`; low-level
  `rateLimit`/`rateLimitByUserId`/`rateLimitByIp` kept (still unit-tested) as the
  in-memory primitives.
- `src/lib/ai/usage.ts` — deleted dead `chatUsageToday` (+ its `sql` import).
- Routes migrated to `guardAiCall` (+ `withUsage` for the non-streaming AI ones):
  `ai/recommend`, `ai/draft-email` (both gain the record-on-throw fix), `ai/chat`
  (guard + `denyResponse`; `decision.remaining/limit` still feed the X-Rate-Limit
  headers; streaming usage stays inline in the transform `flush`), `search`
  (user-or-IP identity, no model), `import/excel` (no model). Phase 4:
  `moderation/flag` + `courses/[code]/{community,difficulty,reviews}` migrated to
  `guardAiCall`, keeping their existing `{error:"rate_limited",retryAfter}` envelopes.

**Tests:** `tests/unit/limiter.test.ts` (new, 6) — per-user allow-then-block,
feature/identity scoping, quota breaker deny, non-AI features skip the quota check,
and `withUsage` records-and-returns on success + runs estimator + re-throws on error.
`tests/unit/rate-limit.test.ts` unchanged (primitives still exported).

**Verification:** `tsc` clean · `biome` clean on all 42 changed files (2 pre-existing
biome errors remain in untracked Phase-4 `settings/privacy/*` — not part of this work) ·
SQL guard clean · `vitest run tests/unit` → **234 passed** (was 226; +8 limiter).

**Future:** implement `RedisLimitStore` (same `LimitStore` interface) when going
multi-replica; optionally route `provider.ts`'s own `checkQuota` through the same
`QuotaSource` so counts are shared (today it's defense-in-depth).

---

## Summary — all 6 clusters complete

| Cluster | New modules | Tests added | Net |
|---|---|---|---|
| #3 Term | `term.ts` | +16 | ~107 dup LOC → 1 module |
| #4 Excel | `courses/code.ts`, `imports/excel-engine.ts` | +16 | route 210→120 LOC, pure engine |
| #5 Embedder | `embedder.ts`, `embedder.xenova.ts`, `embedders/fake.ts` | +5 | zero call-site churn, mockable |
| #1 LLM port | `llm-port.ts`, `providers/{groq,fake}-provider.ts` | +7 | retry/quota keyless-testable |
| #2 Repos | `repositories/{types,course-catalog-repo,plan-repo}.ts` | 0 (parity) | seam + shim, Phase-1 slice |
| #6 Limiter | `limits/{config,store,memory-store,limiter,index}.ts` | +8 | 3 limiters → 1 facade, throw-bug fixed |

**Test count:** 176 → **234 unit** (+58), integration parity preserved. Every cluster
verified `tsc` + `biome` + SQL-guard + `vitest` green. Deferred by design: `scripts/
parse-excel.ts` dedup (tsx alias risk), repository phases 2–5, `RedisLimitStore`,
Gemini adapter.

---

## Phase 4 deepening pass (community/scraping/observability)

> The 6 clusters above covered Phase 1–3 code. After Phase 4 shipped, a second
> Explore sweep (this round, driven by the `improve-codebase-architecture` skill)
> surfaced 7 friction clusters in the new community/scraping/observability code.
> Each was designed via parallel architect agents (3 constraint-driven options +
> a recommendation); all converged on pragmatic minimal extraction. Same verify
> bar: `tsc` + `biome` + SQL-guard + `vitest` green per cluster.

| # | Cluster | New modules | Tests | Net |
|---|---------|-------------|-------|-----|
| P4-1 | Community aggregates | `community/aggregates.ts` | +9 | inline SQL/JS aggregate math → pure `computeDifficultyAggregate`/`computeReviewAggregate`/`difficultyBucket`; difficulty + reviews delegate |
| P4-2 | Summaries cache | `SummaryDeps` seam in `summaries.ts` (`_deps` test hook) | +5 | stale-while-revalidate cache now unit-testable with injected post-loader/graph/clock; default prod wiring unchanged |
| P4-3 | Scrape orchestration | `community/fetch-posts.ts` | +9 | Reddit→Brave fallback decision extracted as pure `fetchPostsForCourse` (discriminated-union result, `budget_exhausted` stop); script is a thin persist shell |
| P4-4 | OpenRouter guards | (tests only) | +8 | `assertFreeModel` allowlist + `isOpenRouterSpendSafe` pre-flight covered (from #101) |
| P4-5 | Analytics gate | `analytics/is-allowed.ts` | +7 | pure `isAnalyticsAllowed(input)`; client collects globals then defers; fixed duplicated `CONSENT_KEY` literal |
| P4-6 | GDPR purge **(real bug)** | rewrote `gdpr.ts` bodies | +1 | **non-transactional N+1 purge loop → single transactional batched DELETE** (partial-purge bug fixed); export N+1 → `Promise.all` + batched `inArray`; added `purgeExpiredAccountsDetailed` |
| P4-7 | Route guards | `api/route-guard.ts` + `api/course-code.ts` | +10 | session+limit+code preamble across 6 routes → `authGuard`/`authLimitGuard`/`courseGuard`/`courseThenLimitGuard`/`courseLimitGuard`. **HTTP contracts byte-identical** — two guard variants preserve each route's limit-vs-code ordering; community route's narrower `\d{3}` regex widened to the shared `\d{3,4}[A-Z]?` (latent-bug fix) |

**Phase 4 net:** 7 new pure/seam modules, +49 tests (234 → ~342 unit incl. earlier Phase-4 feature tests), the GDPR partial-purge correctness bug fixed, route boilerplate dedup'd with contracts preserved. The `code-reviewer` agent that audited the Phase 1–3 refactor also confirmed no regressions there; it flagged one pre-existing `statusFromString("completed")→"planned"` bug which was fixed with a regression test.

**Key contract-preservation note (P4-7):** the community routes emit `{error:"rate_limited",retryAfter}` on 429 while `/ai/*` routes use `denyResponse`'s `{error:"Rate limit reached."}`. These were deliberately NOT unified — the guard's `communityDeny` reproduces the community shape exactly so the migration is observably a no-op.
