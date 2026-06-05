# CLAUDE.md

> Project-specific instructions for Claude Code. Read this on every session.

This file tells Claude Code how to work in the SOEN Compass codebase. **Always read PRD.md alongside this file for product requirements.**

---

## 🎯 Project at a glance

**SOEN Compass** is an AI-powered degree planner for Concordia BEng Software Engineering students.

- **Stack:** Next.js 16 + TypeScript + Tailwind v4 + Drizzle + Postgres + pgvector + Better Auth + Groq + Gemini
- **Hosting:** Railway (Hobby plan, $0/mo within credit)
- **Repo:** Open source, MIT license
- **Solo developer:** Amir Ghadimi (learning while shipping)

## 📖 Where to find what

| Need | Read |
|---|---|
| Product features, specs, acceptance criteria | `PRD.md` |
| Coding conventions (this file) | `CLAUDE.md` |
| System design decisions | `ARCHITECTURE.md` |
| Onboarding for visitors | `README.md` |
| Database schema | `src/lib/data/schema.ts` (or PRD §3) |
| Claude Code prompts | PRD §11 |
| **Design tokens, fonts, components (source of truth)** | **`docs/design/HANDOFF.md`** |
| **Visual mockups (all screens, 16 phases)** | **`docs/design/Phase *.html`** |
| **Brand assets (logos, favicons)** | **`docs/design/brand/`** |

> **Design system (current = "Meridian"):** The canonical design source is **`src/app/globals.css`** — the token-driven **Meridian** system (warm bone paper, ink borders, offset hard-shadows, Clementine accent + a 5-palette `data-accent` toggle, Bricolage/Hanken/JetBrains fonts, boxed `<CourseCode>` chips). See [ARCHITECTURE.md ADR-017](ARCHITECTURE.md). Earlier systems (PRD §8 blue, `docs/design/HANDOFF.md` Graphite Greens, "Lumen") are **historical**; their token *names* survive as aliases in `globals.css`. Use Meridian tokens/classes (`--paper`/`--ink`/`--line`/`--accent`, `.card`/`.card-hard`/`.eyebrow`) for new UI — never hardcode hex except text on accent fills.

> **Directory layout note (post-reorg):** `src/lib/` is organized by domain — `auth/` (auth, get-session, is-admin, access-control), `data/` (db, schema, repositories, queries — one layer), `domain/` (prereq-graph, requirements, term, workload), `ai/`, `community/`, `limits/`, `api/` (route-guard), `validation/`. The IP limiter is `src/lib/ip-rate-limit.ts`; the user/quota limiter is `src/lib/limits/`. All `/ai/*` routes share `aiGuard` + `runAiUsage`. Older refs in this file to `lib/db/*`, `lib/rate-limit.ts`, `lib/auth-client.ts` now live under those folders.

---

## ✅ Always Do

### Code style
- **TypeScript strict mode** — `tsconfig.json` has `strict: true`, `noUncheckedIndexedAccess: true`
- **No `any` types** — use `unknown` + type guards if needed
- **Explicit return types** on exported functions
- **Path aliases:** Use `@/` for `src/` imports (configured in `tsconfig.json`)
- **Biome formatter** — `npm run format` before commit
- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `prd:`

### React patterns
- **Server Components by default** — only use `'use client'` when truly needed (interactivity, hooks, browser APIs)
- **Server Actions over API routes** for mutations from forms
- **API Route Handlers** for: streaming, file uploads, webhooks, public API
- **No `useEffect` for data fetching** — use RSC + `await` or React Query for client
- **No `getServerSideProps`** — Pages Router is forbidden (App Router only)
- **Form handling:** React Hook Form + Zod resolver
- **Optimistic UI:** Use `useOptimistic` for instant feedback

### Component organization
- One component per file
- Filename = component name (kebab-case): `course-card.tsx`
- Component name = PascalCase: `CourseCard`
- Co-locate styles, types, helpers in the same file unless reused
- Reusable components in `components/`, page-specific in route folders

### Styling
- **Tailwind utility classes** — no CSS modules, no styled-components
- Use shadcn/ui components before building custom
- Custom design tokens in `app/globals.css` (CSS variables with OKLCH)
- Dark mode via `next-themes` — use `dark:` variants in Tailwind
- Mobile-first: base styles for mobile, `md:`, `lg:`, `xl:` for larger screens

### Data fetching
- Server Components → `await db.query.x.findMany()` directly
- Mutations → Server Actions with `'use server'` directive
- Client-side reactivity → `useOptimistic` + `useTransition`
- Long-running ops → background jobs via `importJobs` pattern
- Never fetch from `/api/` routes inside Server Components — call DB directly

### Database
- **Drizzle ORM only** — no Prisma, no raw SQL strings (except migrations)
- All schemas in `lib/db/schema.ts`
- Type-safe queries via Drizzle's `db.query.x.findMany({...})`
- Migrations: `npm run db:generate` then `npm run db:migrate`
- Always include `createdAt`/`updatedAt` timestamps on new tables
- Use `references()` with `onDelete: 'cascade'` where appropriate

### Authentication
- **Better Auth only** — no NextAuth, no Clerk, no Supabase Auth
- Server-side auth check: `await auth.api.getSession({ headers: ... })`
- Client-side: `authClient.useSession()` from `lib/auth-client.ts`
- Protect routes via `middleware.ts`
- Public routes: `/`, `/u/*`, `/about`, `/privacy`, `/terms`, `/demo`

### AI features
- **Use lib/ai/provider.ts** — never call Groq/Gemini directly
- **Always rate-limit** AI endpoints (see `lib/rate-limit.ts`)
- **Save conversations** to `aiConversations` + `aiMessages`
- **Track usage** in `aiUsage` table
- **Cite sources** — every AI response includes source references
- **RAG via lib/ai/rag.ts** — never inline embedding logic

### Error handling
- All Server Actions return `{ success: true, data } | { success: false, error }`
- Route handlers return appropriate HTTP status codes
- User-facing errors: friendly messages via toast
- Developer errors: log to Sentry with context
- Use error boundaries at route group level

### UI requirements (non-negotiable)
- Skeleton loaders during data fetch (never spinners)
- Toast notifications for every mutation (success + error)
- Empty states with illustration + CTA
- Loading states for every async operation
- Focus indicators visible on keyboard nav
- Tooltips on icon-only buttons
- Mobile responsive at every breakpoint

---

## ❌ Never Do

| Never | Why |
|---|---|
| Use Pages Router | App Router only |
| Use Prisma | Drizzle only |
| Use Supabase Auth | Better Auth only |
| Install ESLint or Prettier | Biome handles both |
| Use OpenAI / Anthropic APIs | Groq + Gemini are free |
| Scrape RateMyProfessors | ToS violation — link out only |
| Use `useEffect` for data fetching | RSC / Server Actions |
| Use `getServerSideProps` | Server Components |
| Store secrets in code | `.env` only |
| Skip rate limiting on AI endpoints | Abuse risk |
| Use `any` type | Use `unknown` + guards |
| Use CSS modules / styled-components | Tailwind only |
| Build custom components if shadcn/ui has one | Use shadcn first |
| Commit `.env` files | Always `.gitignore` |
| Skip tests for new features | Vitest required for utils |
| Hard-code course data | Use DB / scraper |
| Use Pages Router patterns | App Router patterns only |
| Mix Server + Client logic in one file | Separate concerns |
| Mutate data in Server Components | Use Server Actions |

---

## 🧪 Testing requirements

| Code type | Test required? |
|---|---|
| Utility functions (`lib/utils.ts`, validation, parsing) | ✅ Vitest unit tests |
| React components with logic | ✅ Component tests |
| API routes | ✅ E2E or integration |
| UI-only components | ⚠️ Optional |
| Page components | ⚠️ E2E for critical flows |

**Critical E2E flows to test (Playwright):**
1. Signup → onboarding → first plan saved
2. Drag course between terms
3. Generate PDF export
4. View public profile without auth
5. Ask Compass chat (mocked AI)
6. Excel import flow

---

## 🚀 Performance budget

- **Lighthouse score:** 90+ across all categories
- **First Contentful Paint:** <1.5s
- **Time to Interactive:** <3s
- **Bundle size per route:** <200KB JS
- **AI chat response:** <2s first token (Groq is fast)
- **Vector search:** <100ms (HNSW index)

---

## 🔧 Common tasks

### Adding a new page
1. Create `app/(dashboard)/[name]/page.tsx`
2. Add to sidebar nav in `components/nav/sidebar.tsx`
3. Add route protection in `middleware.ts` if needed
4. Add e2e test if it's a critical flow

### Adding a new course feature
1. Update `lib/db/schema.ts` if schema changes
2. Run `npm run db:generate` to create migration
3. Update `data/soen-courses.json` seed
4. Update `scripts/seed-courses.ts` if structure changes
5. Run `npm run db:seed`
6. Add API route or Server Action
7. Build UI component
8. Add tests

### Adding a new AI feature
1. Add prompt template to `lib/ai/prompts.ts`
2. Add task type to `lib/ai/provider.ts` `AITask` union
3. Update `selectModel()` routing
4. Add API route at `app/api/ai/[feature]/route.ts`
5. Add rate limiting (`lib/rate-limit.ts`)
6. Track usage in `aiUsage` table
7. Build UI

### Updating dependencies
1. `npm outdated` to check
2. `npm update [pkg]` for minor/patch
3. For major versions: read changelog, test thoroughly
4. Commit with `chore(deps): update X to vY`

### Running migrations
```bash
npm run db:generate  # creates migration file
npm run db:migrate   # applies to DB
npm run db:studio    # visual DB browser
```

### Local development
```bash
# Setup
cp .env.example .env  # fill in values
npm install
npm run db:migrate
npm run db:seed

# Dev
npm run dev           # localhost:3000

# Before commit
npm run lint
npm run typecheck
npm run test
```

---

## 🎨 Design system reference

### Colors (use Tailwind utility)
- Primary: `bg-brand-500 text-white`
- Success: `bg-success/10 text-success`
- Warning: `bg-warning/10 text-warning`
- Danger: `bg-danger/10 text-danger`

### Typography
- Page title: `text-3xl font-bold`
- Section heading: `text-xl font-semibold`
- Body: `text-base text-foreground`
- Muted: `text-sm text-muted-foreground`
- Course codes: `font-mono`

### Spacing
- Card padding: `p-6`
- Section gap: `space-y-6`
- Inline gap: `gap-3`
- Page padding: `px-6 py-8 md:px-8`

### Radius
- Buttons/inputs: `rounded-md`
- Cards: `rounded-lg`
- Modals: `rounded-xl`

### Common patterns
- Loading: `<Skeleton className="h-12 w-full" />`
- Empty state: centered icon + heading + description + CTA button
- Error boundary: friendly message + retry button + report link

---

## 📋 PR / commit conventions

### Commit message format
```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional, for breaking changes)>
```

**Types:**
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `style:` formatting (no code change)
- `refactor:` code change without feature/fix
- `test:` adding tests
- `chore:` maintenance, deps
- `prd:` PRD updates

**Examples:**
- `feat(planner): add drag-and-drop between terms`
- `fix(ai): handle Groq 429 rate limit by falling back to Gemini`
- `docs(readme): add screenshot of dashboard`
- `prd: lock in 3-tier AI model routing`

### PR checklist
- [ ] All tests pass (`npm run test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Biome formatting clean (`npm run lint`)
- [ ] Mobile responsive verified
- [ ] Dark mode verified
- [ ] Accessibility check (keyboard nav, screen reader)
- [ ] Updated PRD if scope changed
- [ ] Added to changelog if user-facing

---

## 🔍 Debugging

### Common issues

**"Module not found '@/...'"**
- Check `tsconfig.json` `paths` config
- Verify file exists at the path

**"Hydration mismatch"**
- Don't render dates with `new Date()` in Server Components without locale
- Don't use `typeof window` in render
- Check for inconsistent component trees

**"pgvector extension not found"**
- Run `CREATE EXTENSION IF NOT EXISTS vector;` in Postgres
- Restart Drizzle Kit after extension install

**"Groq API rate limit hit"**
- Check `lib/rate-limit.ts` is enforcing 50/day per user
- Verify Gemini fallback is working in `lib/ai/provider.ts`
- Check `aiUsage` table for unusual patterns (potential abuse)

**"Better Auth session not found"**
- Check `BETTER_AUTH_SECRET` env var
- Check `BETTER_AUTH_URL` matches deployment URL
- Verify middleware is applied to protected routes

### Logs to check
- Local: terminal output
- Railway: dashboard → Service → Logs tab
- Sentry: error details + stack traces
- PostHog: user session replays

---

## 🎓 Learning resources

When stuck, prefer these sources (in order):

1. **Official docs:**
   - Next.js: https://nextjs.org/docs
   - Drizzle: https://orm.drizzle.team/docs
   - Better Auth: https://better-auth.com/docs
   - Groq: https://console.groq.com/docs
   - shadcn/ui: https://ui.shadcn.com/docs

2. **This codebase:**
   - PRD.md for product context
   - ARCHITECTURE.md for system context
   - Existing similar code

3. **Last resort:**
   - GitHub issues
   - Stack Overflow

---

## 🚦 When to ask vs. when to decide

**Just decide:**
- Naming variables/functions
- Internal code structure
- Test cases
- Comments / docstrings
- Linting fixes

**Ask user:**
- Adding new dependencies (check stack first)
- Changing schema (impacts data)
- Changing user-visible UI significantly
- Skipping PRD requirements
- Bumping major versions
- Renaming public APIs

---

## 🎯 The 3 commandments

1. **Read PRD.md and this file at the start of every session.**
2. **When in doubt, follow the stack and conventions in this file.**
3. **Ask if you'd be making a decision that affects the user, the data, or the stack.**

🚀 Ship it.
