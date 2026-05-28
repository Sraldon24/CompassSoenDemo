# SOEN Compass — Product Requirements Document (PRD)

> **An AI-powered degree planner for Concordia BEng Software Engineering students.**

**Version:** 2.0
**Status:** Ready for development
**Date:** May 27, 2026
**Author:** Amir Ghadimi
**Repository:** github.com/amirghadimi/soen-compass (TBD)
**Target users:** Concordia SOEN students
**Tagline:** "Plan your Software Engineering degree the smart way."

## Changelog

- **v2.0 (May 27, 2026):** Added AI features (Groq 3-tier + Gemini fallback), Excel/CSV import, demo mode, semantic search (pgvector + sentence-transformers), moderation system, observability (Sentry + PostHog), privacy/GDPR, rate limiting, onboarding wizard, keyboard shortcuts. All-free stack confirmed.
- **v1.0 (May 26, 2026):** Initial spec.

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [Feature Specs (v1)](#4-feature-specs-v1)
5. [Wireframes](#5-wireframes)
6. [API Routes](#6-api-routes)
7. [User Flows](#7-user-flows)
8. [Design System](#8-design-system)
9. [UI Quality Standards](#9-ui-quality-standards)
10. [Roadmap](#10-roadmap)
11. [Claude Code Bootstrap Prompts](#11-claude-code-bootstrap-prompts)
12. [Folder Structure](#12-folder-structure)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Guide](#14-deployment-guide)
15. [Scraping Architecture](#15-scraping-architecture)
16. [AI Architecture](#16-ai-architecture)
17. [Observability](#17-observability)
18. [Privacy & Compliance](#18-privacy--compliance)
19. [Rate Limiting & Anti-Abuse](#19-rate-limiting--anti-abuse)
20. [Onboarding Wizard](#20-onboarding-wizard)
21. [Keyboard Shortcuts](#21-keyboard-shortcuts)
22. [Testing Strategy](#22-testing-strategy)
23. [Open Source Setup](#23-open-source-setup)

---

## 1. Project Vision

### 1.1 Mission

Help Concordia BEng Software Engineering students plan, track, and optimize their entire degree through an AI-powered, polished, free web application. Replace the patchwork of Excel sheets, PDFs, Reddit threads, and advisor emails with one cohesive tool.

### 1.2 Core Differentiators

| Capability | Existing tools | SOEN Compass |
|---|---|---|
| Visual term planning | Manual | Drag-and-drop |
| Prereq map | Text only | Interactive D3.js graph |
| AI chatbot | None | RAG over Concordia + Reddit + community |
| Recommendations | None | Interest-based AI suggestions |
| Plan validation | Manual | Real-time rules engine |
| Workload prediction | None | Statistical model |
| Semantic search | Keyword only | Vector embeddings |
| Community ratings | Off-site | Built-in difficulty + reviews |
| Export | PDF only | PDF + .ics + public profile |

### 1.3 Success Metrics

**North Star:** % of v1 users who plan all 4 years in their first session.

**Secondary:**
- Daily active users during peak registration
- AI queries per user per week
- Profile shares
- PDF exports per week
- GitHub stars
- Reddit mentions

### 1.4 6-Month Goals

- 100+ registered SOEN students
- 30+ public profiles linked from LinkedIn/resumes
- 1,000+ AI chat queries answered
- Listed on r/Concordia sidebar
- 100+ GitHub stars
- Used as Co-op portfolio piece

---

## 2. Tech Stack

All decisions LOCKED. Total monthly cost: **$0**.

### 2.1 Frontend

| Layer | Tool | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Industry standard, Railway-friendly |
| Runtime | Node.js 22 LTS | Latest LTS |
| Language | TypeScript 5.6+ strict | Required for SE jobs |
| UI | React 19 | Server Components |
| Styling | Tailwind CSS v4 | Atomic, fast |
| Components | shadcn/ui (new-york style) | Polished, accessible |
| Primitives | Radix UI | Accessibility |
| Icons | Lucide React | 1400+ icons |
| Fonts | Geist Sans + Geist Mono | Vercel premium, free |
| Animations | Motion (Framer 11+) | Micro-interactions |
| Forms | React Hook Form + Zod | Best DX |
| Theming | next-themes | Light/dark toggle |
| Drag-drop | @dnd-kit/core | Accessible, modern |
| Data viz | D3.js v7 | Prereq graph |
| Charts | Recharts | Progress charts |
| Toasts | sonner | Notifications |
| Command palette | cmdk | ⌘K search |
| Excel | xlsx | Import parsing |
| CSV | papaparse | Import parsing |

### 2.2 Backend

| Layer | Tool | Why |
|---|---|---|
| API | Next.js Route Handlers + Server Actions | Same codebase, type-safe |
| Database | PostgreSQL 16 | Railway native |
| Vector ext | pgvector | Embeddings storage |
| ORM | Drizzle | TypeScript-first |
| Migrations | Drizzle Kit | Native |
| Auth | Better Auth | Self-hosted, no lock-in |
| Validation | Zod | Runtime safety |
| Dates | date-fns | Tree-shakeable |
| Rate limiting | lru-cache (in-memory) | No Redis needed v1 |

### 2.3 AI Stack (all free)

| Component | Choice | Free Limits |
|---|---|---|
| **Fast LLM** | Groq Llama 3.1 8B Instant | 14,400 RPD, 30K TPM, 840 TPS |
| **Smart LLM** | Groq Llama 3.3 70B Versatile | 14,400 RPD, 6K TPM, 394 TPS |
| **Fallback LLM** | _Deferred for v1_ (Gemini 2.0 Flash slot kept in env, not wired) | — |
| **Embeddings** | sentence-transformers `all-MiniLM-L6-v2` | $0, local, 384 dims, ~80MB |
| **LLM SDK** | Vercel AI SDK | Free, MIT |
| **Vector DB** | pgvector in Postgres | $0, no Pinecone needed |
| **RAG pipeline** | Custom (no LangChain) | Simpler, fewer deps |

**Why this combo:**
- Groq is the fastest LLM inference in 2026 (LPU hardware)
- 14,400 RPD × 2 Groq models = 28,800 daily request capacity
- Embeddings run locally — no API cost for vector search
- Total capacity supports ~500 active users on free tiers alone
- **On Groq 429:** retry with exponential backoff (3 attempts, 1s/2s/4s). If still failing, return 503 to caller. Gemini fallback added later if usage justifies (see ADR-012).

### 2.4 Infrastructure

| Service | Cost |
|---|---|
| Railway Hobby (app + Postgres + Cron) | $0 (covered by $5/mo credit) |
| GitHub + Actions CI | Free |
| Sentry (errors) | Free (5K errors/mo) |
| PostHog (analytics) | Free (1M events/mo) |
| Resend (email, future) | Free (3K/mo) |

### 2.5 Scraping

| Tool | Purpose |
|---|---|
| Crawlee (TS) | Web scraping framework |
| Playwright | JS-rendered pages |
| Cheerio | Static HTML |
| Reddit API | r/Concordia (no scraping needed) |

### 2.6 Testing & Dev

| Tool | Purpose |
|---|---|
| Vitest | Unit tests |
| Playwright Test | E2E tests |
| @testing-library/react | Component tests |
| MSW | Mock APIs |
| Biome | Lint + format (replaces ESLint/Prettier) |
| Husky + lint-staged | Pre-commit hooks |
| Commitlint | Conventional Commits |

### 2.7 Why Next.js Not NestJS

| Factor | Next.js | NestJS |
|---|---|---|
| Codebases needed | 1 | 2 (API + frontend) |
| Solo dev efficiency | 🟢 | 🟡 |
| Resume signal | 🟢 (trending) | 🟢 (enterprise) |
| GitHub appeal | 🟢 (UI shareable) | 🟡 (backend invisible) |
| Demo-ability | 🟢 (live URL) | 🔴 (needs API client) |

**Decision:** Next.js monolith. Document NestJS consideration in interviews ("kept monolith because solo dev").

---

## 3. Database Schema

```typescript
// lib/db/schema.ts
import {
  pgTable, uuid, text, timestamp, real, boolean, jsonb,
  integer, pgEnum, primaryKey, vector, index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ENUMS
export const courseStatusEnum = pgEnum('course_status', [
  'planned', 'enrolled', 'completed', 'transferred',
  'dropped', 'disc', 'failed'
]);
export const programEnum = pgEnum('program', [
  'SOEN-General', 'SOEN-AvionicsEmbedded', 'SOEN-Web', 'SOEN-RealTime'
]);
export const courseCategoryEnum = pgEnum('course_category', [
  'eng_core', 'se_core', 'eng_nsci_group', 'nat_sci_elective',
  'soen_elective', 'gen_ed_humanities', 'deficiency'
]);
export const difficultyVoteEnum = pgEnum('difficulty_vote', ['easy', 'medium', 'hard']);
export const moderationStatusEnum = pgEnum('moderation_status', ['active', 'flagged', 'hidden', 'deleted']);
export const aiModelEnum = pgEnum('ai_model', [
  'groq-llama-3.1-8b', 'groq-llama-3.3-70b', 'gemini-2.0-flash', 'cached'
]);

// USERS (managed by Better Auth)
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// PROFILES
export const profiles = pgTable('profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  studentId: text('student_id'),
  program: programEnum('program').default('SOEN-General'),
  entryTerm: text('entry_term'),
  expectedGraduation: text('expected_graduation'),
  isPublic: boolean('is_public').default(false),
  publicSlug: text('public_slug').unique(),
  showGpa: boolean('show_gpa').default(false),
  showDeficiencies: boolean('show_deficiencies').default(false),
  showFuturePlan: boolean('show_future_plan').default(true),
  showCoopStatus: boolean('show_coop_status').default(false),
  inCoopProgram: boolean('in_coop_program').default(false),
  coopApplicationStatus: text('coop_application_status'),
  interests: jsonb('interests').$type<string[]>(),
  careerGoal: text('career_goal'),
  bio: text('bio'),
  linkedinUrl: text('linkedin_url'),
  githubUrl: text('github_url'),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  onboardingStep: integer('onboarding_step').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// COURSES
export const courses = pgTable('courses', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  credits: real('credits').notNull(),
  description: text('description'),
  category: courseCategoryEnum('category'),
  group: text('group'),
  prereqs: jsonb('prereqs').$type<{
    all?: string[]; any?: string[]; concurrent?: string[]; notes?: string;
  }>(),
  coreqs: jsonb('coreqs').$type<string[]>(),
  offeredFall: boolean('offered_fall').default(true),
  offeredWinter: boolean('offered_winter').default(true),
  offeredSummer: boolean('offered_summer').default(false),
  difficultyAvg: real('difficulty_avg'),
  totalDifficultyVotes: integer('total_difficulty_votes').default(0),
  avgHoursPerWeek: real('avg_hours_per_week'),
  lastScrapedAt: timestamp('last_scraped_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// COURSE EMBEDDINGS (for semantic search)
export const courseEmbeddings = pgTable('course_embeddings', {
  courseCode: text('course_code').primaryKey().references(() => courses.code, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 384 }),
  embeddingText: text('embedding_text'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  embeddingIdx: index('idx_course_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// USER COURSES (plan)
export const userCourses = pgTable('user_courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseCode: text('course_code').references(() => courses.code).notNull(),
  status: courseStatusEnum('status').default('planned').notNull(),
  term: text('term'),
  year: integer('year'),
  grade: text('grade'),
  gradePoint: real('grade_point'),
  isDeficiency: boolean('is_deficiency').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DEADLINES
export const deadlines = pgTable('deadlines', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  category: text('category'),
  date: timestamp('date').notNull(),
  description: text('description'),
  url: text('url'),
  isRecurring: boolean('is_recurring').default(false),
  recurrenceRule: text('recurrence_rule'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// CHECKLIST
export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  task: text('task').notNull(),
  category: text('category'),
  dueDate: timestamp('due_date'),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DIFFICULTY VOTES
export const difficultyVotes = pgTable('difficulty_votes', {
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseCode: text('course_code').references(() => courses.code).notNull(),
  vote: difficultyVoteEnum('vote').notNull(),
  term: text('term'),
  instructor: text('instructor'),
  comment: text('comment'),
  moderationStatus: moderationStatusEnum('moderation_status').default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.courseCode] }),
}));

// PROFESSORS + REVIEWS
export const professors = pgTable('professors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  department: text('department'),
  email: text('email'),
  externalUrl: text('external_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const professorReviews = pgTable('professor_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  professorId: uuid('professor_id').references(() => professors.id).notNull(),
  courseCode: text('course_code').references(() => courses.code),
  rating: integer('rating').notNull(),
  difficulty: integer('difficulty'),
  term: text('term'),
  wouldTakeAgain: boolean('would_take_again'),
  comment: text('comment'),
  isAnonymous: boolean('is_anonymous').default(true),
  moderationStatus: moderationStatusEnum('moderation_status').default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// MODERATION FLAGS
export const moderationFlags = pgTable('moderation_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: text('reporter_id').references(() => users.id).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').default('pending'),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// AI CONVERSATIONS
export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => aiConversations.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  model: aiModelEnum('model'),
  tokensUsed: integer('tokens_used'),
  contextSources: jsonb('context_sources').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// AI USAGE (rate limiting)
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  feature: text('feature').notNull(),
  model: aiModelEnum('model'),
  tokensUsed: integer('tokens_used').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userDateIdx: index('idx_ai_usage_user_date').on(table.userId, table.createdAt),
}));

// IMPORTS
export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  source: text('source').notNull(),
  filename: text('filename'),
  status: text('status').default('pending'),
  rowsProcessed: integer('rows_processed').default(0),
  rowsImported: integer('rows_imported').default(0),
  errors: jsonb('errors').$type<{ row: number; message: string }[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// USAGE EVENTS (also tracked in PostHog)
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id),
  sessionId: text('session_id'),
  eventName: text('event_name').notNull(),
  properties: jsonb('properties'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// SCRAPED CHANGES (admin queue)
export const scrapedChanges = pgTable('scraped_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  changeType: text('change_type').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  status: text('status').default('pending'),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// REDDIT POSTS (for AI summarization)
export const redditPosts = pgTable('reddit_posts', {
  id: text('id').primaryKey(),
  courseCode: text('course_code').references(() => courses.code),
  title: text('title').notNull(),
  body: text('body'),
  author: text('author'),
  score: integer('score'),
  numComments: integer('num_comments'),
  url: text('url'),
  postedAt: timestamp('posted_at'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
});

export const redditEmbeddings = pgTable('reddit_embeddings', {
  postId: text('post_id').primaryKey().references(() => redditPosts.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 384 }),
}, (table) => ({
  embeddingIdx: index('idx_reddit_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// RELATIONS
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  courses: many(userCourses),
  checklistItems: many(checklistItems),
  difficultyVotes: many(difficultyVotes),
  professorReviews: many(professorReviews),
  aiConversations: many(aiConversations),
  importJobs: many(importJobs),
}));
```

---

## 4. Feature Specs (v1)

### 4.1 Dashboard
- Welcome header with progress bar (X/120 cr)
- Stats grid: Done | In Progress | Planned | Remaining | Deficiencies
- "AI Insight of the Day" widget (proactive AI suggestion)
- "Upcoming Deadlines" widget (next 30 days)
- "Action Items" widget (uncompleted tasks)
- "Recommended Next Courses" (AI-powered)

### 4.2 Term Planner
- Horizontal scroll: Fall 2026 → Winter 2030
- Drag-and-drop courses between terms (@dnd-kit)
- Click course → side sheet with details
- Real-time prereq violation warnings
- Auto-calculated credit totals per term
- Workload prediction badge (Light/Medium/Heavy/Burnout)
- Full-time status indicator (12+ credits)

### 4.3 Prereq Map
- D3.js force-directed graph
- Nodes = courses (colored by category, sized by credits)
- Edges = prereqs (solid) / coreqs (dashed)
- Hover highlights paths
- Filter: My Plan / All SOEN / By Category

### 4.4 Requirements Checklist
- Categorized: Eng Core, SE Core, Eng & Nat Sci Group, Nat Sci Electives, SOEN Electives, Gen Ed, Deficiencies
- Progress bar per category
- Empty slot recommendations (AI-powered)

### 4.5 Email Templates
- 9 pre-drafted templates (from Excel work)
- Variables auto-filled from profile
- Copy-to-clipboard + Open in Mail
- AI-assisted custom email drafting

### 4.6 Deadline Widget
- Compact list on Dashboard
- Full calendar page
- Color-coded by urgency

### 4.7 Smart Features (all 6)
1. Drag-and-drop courses (@dnd-kit)
2. Prereq violation detection (rules engine, no LLM)
3. Auto credit totals (React selectors)
4. Graduation timeline (CSS grid Gantt)
5. GPA calculator (Concordia grade scale)
6. Cross-feature integration (Context state)

### 4.8 Public Profile
- URL: `soencompass.app/u/{slug}`
- Hero: name, program, expected grad
- Donut chart of progress by category
- Completed / Current / Future sections
- Privacy toggles per section
- "Download PDF" button

### 4.9 Course Difficulty Votes
- Vote buttons (Easy/Medium/Hard)
- Average + distribution display
- Optional comment + term + instructor

### 4.10 Professor Reviews
- Per-prof: rating, would-take-again %, recent reviews
- Anonymous by default
- Link to RateMyProfessors (external, never scraped)
- Moderation: flag inappropriate content

### 4.11 AI Features

#### 4.11.1 Ask Compass Chatbot
Natural-language Q&A with RAG over courses + Reddit + community data.

**Examples:**
- "When can I take COMP 472?"
- "Summarize what r/Concordia says about Prof Kosseim"
- "What AI electives should I take?"

**How it works:**
1. User asks question
2. Embed query via sentence-transformers
3. pgvector search top 10 relevant chunks
4. Build context-rich prompt
5. Stream via Groq Llama 3.3 70B
6. Cite sources beneath answer

**Rate limit:** 50 messages/day per user

#### 4.11.2 Smart Course Recommendations
- Triggered: "Recommend electives" button or proactive dashboard prompt
- Uses: user interests + plan + course embeddings
- Output: top 5 courses with AI-generated "why" explanations
- Model: Llama 3.3 70B (smart tier)

#### 4.11.3 Plan Validation (NO LLM — rules engine)
- Pure JS function `validatePlan(courses)`
- Returns: `{ courseCode, issue, severity, suggestion }[]`
- Checks: prereqs met, coreqs satisfied, credit load, deficiencies, EWT, graduation
- Why no LLM: faster, free, deterministic

#### 4.11.4 Semantic Search
- ⌘K command palette
- Postgres full-text (keyword) OR pgvector (semantic)
- Top 10 results with relevance scores
- Sub-second response via HNSW index

#### 4.11.5 Reddit Summarization
- Per course: AI-generated TL;DR of r/Concordia mentions
- Sentiment indicator (positive/neutral/negative)
- Cached 7 days per course
- Links to top original threads

#### 4.11.6 Workload Predictor (NO LLM — statistical)
- Sum `avgHoursPerWeek` for all courses in term
- Thresholds: <30 Light, 30-45 Moderate, 45-60 Heavy, >60 Burnout
- Visual badge on term planner

#### 4.11.7 Email Drafting Assistant
- User describes situation
- AI generates professional email
- Editable before sending

### 4.12 Excel/CSV Import

**Two flows:**

**Flow A: Auto-import from SOEN Compass Excel (v6 format)**
- Recognizes specific tabs and column structure
- Maps to userCourses table
- Preview before commit

**Flow B: Generic CSV**
- Downloadable template
- Columns: Course Code, Term, Status, Grade, Notes
- Upload → preview → commit

**Implementation:** `xlsx` + `papaparse` libraries, Server Action processing.

### 4.13 Demo/Sandbox Mode

- Visit `/` → "Try Demo" button
- Sandboxed app with real course data, seeded plan
- All features work (limited AI: 5 queries/session)
- Plan stored in localStorage
- Banner: "Sign in to save"
- Sign in → migrate localStorage plan to DB

### 4.14 Search

- ⌘K command palette (cmdk)
- Two modes: keyword (Postgres ILIKE) / semantic (pgvector)
- Categories: Courses, Professors, Deadlines, Chat History, Pages
- Recent searches when empty

### 4.15 Moderation System

- "Report" button on user content
- Reasons: spam, harassment, off-topic, false info
- Admin queue at `/admin/moderation`
- Auto-moderation: profanity filter, length limits, rate limits

---

## 5. Wireframes

### 5.1 Dashboard

```
┌──────────────────────────────────────────────┐
│ Welcome back, Amir 👋                        │
│ ████████░░░░░░░░░░ 13% (16/120 cr)          │
│                                               │
│ [16 Done] [9 InProg] [80 Planned] [15 Def]   │
│                                               │
│ ┌─ AI Insight ──────────────────────────────┐│
│ │ 💡 Based on your AI interest, consider    ││
│ │ taking COMP 432 (ML) in Fall 2028...      ││
│ └───────────────────────────────────────────┘│
│                                               │
│ ┌─Deadlines──────┐ ┌─Action Items─────────┐ │
│ │ Sep 4: CSU opt │ │ ☐ Register EWT       │ │
│ │ Sep 8: Classes │ │ ☐ Verify transfer    │ │
│ │ Sep 13: Co-op  │ │                      │ │
│ └────────────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 5.2 Term Planner

```
┌──────────────────────────────────────────────┐
│ My Plan                       [Export ▼]    │
├──────────────────────────────────────────────┤
│ ← [Fall 2026] [Winter 27] [Summer 27] →     │
│    12cr ✅      12cr ✅     10cr 🟡         │
│   ┌────────┐  ┌────────┐  ┌────────┐        │
│   │ENGR 201│  │COMP 232│  │MATH 205│        │
│   │ENGR 202│  │COMP 348│  │PHYS 205│        │
│   │ENGR 301│  │COMP 352│  │SOEN 228│        │
│   │MATH 204│  │PHYS 204│  │        │        │
│   │PHIL 235│  │        │  │[+ Add] │        │
│   │[+ Add] │  │[+ Add] │  │        │        │
│   └────────┘  └────────┘  └────────┘        │
└──────────────────────────────────────────────┘
```

### 5.3 Ask Compass

```
┌──────────────────────────────────────────────┐
│ 💬 Ask Compass            [Clear] [History] │
├──────────────────────────────────────────────┤
│ [You] When can I take COMP 472?              │
│                                               │
│ [Compass] Based on your plan, you'd be       │
│ eligible Winter 2029, after COMP 352 in      │
│ Winter 2027. COMP 472 is loved with Prof     │
│ Kosseim (4.8/5 community rating).            │
│                                               │
│ 📚 Sources:                                   │
│  • COMP 472 catalog                          │
│  • Your plan (COMP 352 W27)                  │
│  • r/Concordia thread (2y ago)               │
│                                               │
│ 👍 👎                                         │
├──────────────────────────────────────────────┤
│ [Type your question...]              [Send] │
│ 47 / 50 messages today                      │
└──────────────────────────────────────────────┘
```

---

## 6. API Routes

### Auth (Better Auth)
- `POST /api/auth/[...all]` — catch-all

### Profile
- `GET /api/profile/me`
- `PATCH /api/profile/me`
- `GET /api/profile/[slug]` — public

### Courses
- `GET /api/courses` — filterable
- `GET /api/courses/[code]`
- `GET /api/courses/[code]/reddit` — AI summary
- `POST /api/courses/[code]/vote-difficulty`
- `GET /api/courses/[code]/reviews`

### Plan
- `GET /api/plan`
- `POST /api/plan` — add
- `PATCH /api/plan/[id]` — update
- `DELETE /api/plan/[id]`
- `POST /api/plan/validate` — rules check
- `POST /api/plan/workload` — predict

### AI
- `POST /api/ai/chat` — streaming
- `POST /api/ai/recommend` — recommendations
- `POST /api/ai/draft-email`
- `GET /api/ai/usage` — current usage

### Search
- `GET /api/search?q={q}&mode={keyword|semantic}`

### Import
- `POST /api/import/excel`
- `POST /api/import/csv`
- `GET /api/import/[jobId]`

### Checklist
- `GET /api/checklist`
- `POST /api/checklist`
- `PATCH /api/checklist/[id]`
- `DELETE /api/checklist/[id]`

### Deadlines
- `GET /api/deadlines/upcoming`
- `GET /api/deadlines/all`

### Export
- `GET /api/export/pdf`
- `GET /api/export/ics`

### Moderation
- `POST /api/moderation/flag`
- `GET /api/admin/moderation` (admin only)

### Admin
- `GET /api/admin/scraped-changes`
- `POST /api/admin/scraped-changes/[id]/approve`
- `POST /api/admin/scrape/trigger`

---

## 7. User Flows

### 7.1 First-time user (with onboarding)
1. Land on `/` → "Sign in with Google"
2. OAuth → `/onboarding`
3. **Step 1:** Welcome
4. **Step 2:** Profile (program, entry term, student ID)
5. **Step 3:** Interests (AI/ML, Web, Mobile, Embedded, etc.)
6. **Step 4:** Existing data (Upload Excel / cégep template / Start fresh)
7. **Step 5:** Confetti + redirect to dashboard

### 7.2 Demo user (no signup)
1. Land on `/` → "Try Demo"
2. Enter sandboxed `/dashboard` with seeded plan
3. Plan in localStorage
4. Banner: "Sign in to save"
5. Sign in → migrate prompt → seamless transition

### 7.3 Ask Compass
1. Click chat button (floating)
2. Side panel opens
3. User types question
4. Server: embed → vector search → build prompt → stream response
5. Sources cited below answer
6. Rate response (👍/👎)

### 7.4 Sharing public profile
1. Settings → Public Profile
2. Toggle "Make public"
3. Pick slug, visibility per section
4. Copy URL, share

---

## 8. Design System

> ⚠️ **SUPERSEDED.** The design tokens in this section are obsolete. The canonical design system is `docs/design/HANDOFF.md` (Claude Designs handoff bundle, **Graphite Greens** palette). Implementers should paste the `@theme` block from HANDOFF.md §1 directly into `app/globals.css`. The block below is preserved only for historical reference of the original PRD draft.

### 8.1 Colors (OKLCH) — _superseded by HANDOFF.md §1_

<details><summary>Original draft tokens (do not implement)</summary>

```css
@theme {
  --color-brand-50: oklch(0.97 0.02 250);
  --color-brand-100: oklch(0.93 0.04 250);
  --color-brand-500: oklch(0.55 0.18 250);
  --color-brand-700: oklch(0.40 0.18 250);
  --color-brand-900: oklch(0.25 0.12 250);
  --color-success: oklch(0.65 0.20 145);
  --color-warning: oklch(0.75 0.18 80);
  --color-danger: oklch(0.60 0.22 25);
  --color-info: oklch(0.65 0.15 220);
  --color-bg: oklch(1 0 0);
  --color-bg-subtle: oklch(0.985 0 0);
  --color-border: oklch(0.92 0 0);
  --color-text: oklch(0.20 0 0);
  --color-text-muted: oklch(0.55 0 0);
}
```

</details>

### 8.2 Typography — _see HANDOFF.md §2_
- Body: Geist Sans, 16px base
- Code/codes: Geist Mono (with `ss01` + slashed-zero on all course codes)
- Scale: 12/14/16/18/20/24/30/36

### 8.3 Spacing & Radius — _see HANDOFF.md §1_
- Spacing: 4px base (`--spacing-1` through `--spacing-16`)
- Radius: 6/8/12/16 + full (`--radius-sm` through `--radius-full`)
- Shadows: sm/md/lg from HANDOFF.md (layered, subtle)

### 8.4 Motion

```ts
export const transitions = {
  fast: { duration: 0.15 },
  default: { duration: 0.25 },
  slow: { duration: 0.5 },
};
```

---

## 9. UI Quality Standards

- ✅ Skeleton loaders (not spinners)
- ✅ Toast for every action (sonner)
- ✅ Optimistic UI updates
- ✅ Keyboard navigation
- ✅ Empty states with CTAs
- ✅ Error boundaries
- ✅ Tooltips on icon buttons
- ✅ Focus indicators (focus-visible)
- ✅ WCAG AA accessibility
- ✅ Mobile responsive (320px → 1920px)
- ✅ Lighthouse 90+ all categories

**Inspiration:** Linear, Vercel, Cal.com, Notion, Raycast.

---

## 10. Roadmap

> **Timeline note:** 8-week roadmap is **estimated, not a hard deadline**. Realistic v1 ship for a solo dev with AI assistance is 10–14 weeks. Phase boundaries are fixed; week numbers are directional.

### Phase 1: Foundation (Week 1-2)
- Next.js 15 + Biome
- Tailwind v4 + shadcn/ui + Geist
- Railway: app + Postgres + pgvector
- Drizzle schema + migrations
- Better Auth + Google OAuth
- App shell with sidebar
- Dark mode toggle
- Deploy to Railway

### Phase 2: Core Planner (Week 3-4)
- Seed courses + embeddings
- Dashboard
- Term Planner (@dnd-kit)
- Prereq validation rules
- Requirements Checklist
- Workload predictor (statistical)
- Onboarding wizard
- Excel import

### Phase 3: AI + Polish (Week 5-6)
- sentence-transformers integration
- pgvector embeddings pipeline
- Ask Compass (Groq + Gemini fallback)
- Smart recommendations
- Semantic search (⌘K)
- Prereq Map (D3.js)
- Email Templates
- AI email drafting
- PDF + .ics export

### Phase 4: Community + Launch (Week 7-8)
- Crawlee scraper
- Reddit API integration
- Reddit summarization
- Difficulty votes UI
- Professor reviews UI
- Moderation system
- Public profiles
- Sentry + PostHog
- Rate limiting
- SEO + README + screenshots
- Post to r/Concordia

---

## 11. Claude Code Bootstrap Prompts

### Prompt 1: Project initialization

```
Initialize Next.js 15 project "soen-compass" with App Router.

Requirements:
- TypeScript strict mode (all strict opts)
- Tailwind CSS v4
- Biome for lint+format (no ESLint/Prettier)
- npm
- Geist Sans + Geist Mono from next/font/google

Initial deps: next-themes lucide-react zod date-fns sonner cmdk

Configure:
- tsconfig.json: strict: true, noUncheckedIndexedAccess: true
- biome.json: recommended rules + organize imports
- .gitignore: standard Next.js + .env + node_modules + .vercel
- README.md: title + quick start

Then npm install and verify dev server.
```

### Prompt 2: shadcn/ui setup

```
Set up shadcn/ui with "new-york" style, "slate" base color.

Install: button input label card dialog sheet dropdown-menu sonner tooltip separator badge avatar form table tabs command popover select skeleton alert

components.json:
- TypeScript: true, RSC: true, style: new-york, baseColor: slate
- cssVariables: true

Set up dark mode with next-themes:
- ThemeProvider wrapping {children} in layout
- defaultTheme: system
- storageKey: soen-compass-theme
- ThemeToggle component with DropdownMenu (Light/Dark/System)
```

### Prompt 3: Database + pgvector

```
Set up Drizzle ORM + Postgres + pgvector.

Install: drizzle-orm postgres @types/pg
Dev: drizzle-kit

Create:
- lib/db/index.ts — Drizzle client via DATABASE_URL using postgres-js driver
- lib/db/schema.ts — I'll paste schema next
- drizzle.config.ts
- .env.example with DATABASE_URL
- npm scripts: db:generate db:migrate db:studio db:push db:seed

First migration MUST include: CREATE EXTENSION IF NOT EXISTS vector;

Schema uses vector columns from drizzle-orm/pg-core for 384-dim embeddings.
```

### Prompt 4: Better Auth + Google OAuth

```
Set up Better Auth (Google OAuth only).

Install: better-auth

Create:
- lib/auth.ts — Better Auth server, Drizzle adapter, Google provider, session strategy: database
- app/api/auth/[...all]/route.ts — catch-all handler
- lib/auth-client.ts — React client
- middleware.ts — protect /dashboard /plan /map /requirements /chat /settings; allow /, /u/*, /about, /privacy, /terms, /demo

Env: BETTER_AUTH_SECRET BETTER_AUTH_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET

Build app/(auth)/login/page.tsx: centered card, single "Continue with Google" button using authClient.signIn.social({ provider: 'google' }).
```

### Prompt 5: App shell + nav

```
Build app/(dashboard)/layout.tsx — main app shell.

Top nav (sticky):
- Logo + "SOEN Compass" left
- Command palette trigger (⌘K) center (use cmdk later)
- User avatar dropdown right

Left sidebar (250px desktop, collapsed icons tablet, hamburger mobile):
- Dashboard (LayoutDashboard)
- My Plan (Calendar)
- Prereq Map (Network)
- Requirements (CheckSquare)
- Ask Compass (MessageSquare)
- Deadlines (Clock)
- Emails (Mail)
- Settings (Settings, bottom)

User dropdown: name+email, Settings, Theme toggle, Sign out (authClient.signOut)

Style: LinkedIn-ish. Active nav has bg-accent + left border accent. Smooth motion transitions.
```

### Prompt 6: Onboarding wizard

```
Build app/(auth)/onboarding/page.tsx — 5-step wizard.

State stored in profiles.onboardingStep.

Step 1 Welcome: Hero "Let's set up your plan in 2 minutes" + Get Started
Step 2 Profile: program select (default SOEN-General), entryTerm, studentId (optional)
Step 3 Interests: multi-select chips (AI/ML, Web, Mobile, Embedded, Game, Security, Data, Robotics, DevOps)
Step 4 Existing data: 3 cards — Upload Excel (drag-drop .xlsx) / Cégep transfer template / Start fresh
Step 5 Done: confetti animation + "Go to Dashboard"

Progress bar at top. Back button. Skip option.

Mark profiles.onboardingCompleted = true on finish.
```

### Prompt 7: Course seeding

```
Create scripts/seed-courses.ts.

Read from data/soen-courses.json (I'll provide).

For each course:
1. Upsert into courses table
2. Generate embedding text: `${code} ${title}. ${description}`
3. Embed via @xenova/transformers (model: Xenova/all-MiniLM-L6-v2)
4. Upsert into courseEmbeddings

Batches of 50. Log progress.

Add npm script: db:seed
```

### Prompt 8: Term Planner with drag-drop

```
Build app/(dashboard)/plan/page.tsx.

Layout: horizontal scroll, each term = 280px column.
Term card: header (name, total credits, full-time ✅, workload badge), CourseCards (draggable), "+ Add" button.

@dnd-kit/core:
- DndContext wrapping
- Each term: droppable
- Each course: draggable
- onDrop: Server Action updates userCourses.term
- Optimistic UI

CourseCard (components/course-card.tsx):
- Bold code, small title, mono credits
- Status pill (Planned/Enrolled/Completed)
- Drag handle on hover
- Prereq violation badge if invalid
- Click → side sheet with details

Prereq validation:
- lib/validation/plan.ts → validatePlan(courses): ValidationIssue[]
- Issue: { courseCode, issue, severity, suggestion }
- Highlight violations red border + tooltip

Workload predictor:
- lib/workload.ts → calculateTermWorkload(courses): { hours, level }
- Levels: light <30, moderate 30-45, heavy 45-60, burnout >60
```

### Prompt 9: AI infrastructure

```
Build AI provider with 3-tier routing.

Install: ai @ai-sdk/groq @google/generative-ai @xenova/transformers lru-cache

Create:

lib/ai/provider.ts:
- selectModel(task): returns 'llama-3.1-8b-instant' | 'llama-3.3-70b-versatile' | 'gemini-2.0-flash'
- Routing:
  * Fast: 'chat-simple', 'search', 'workload-explanation' → 8B Groq
  * Smart: 'chat-complex', 'recommend', 'reddit-summarize', 'email-draft' → 70B Groq
  * Fallback (if Groq returns 429): Gemini Flash
- Function generateResponse(messages, task): handles fallback automatically
- Track usage in aiUsage table

lib/ai/embeddings.ts:
- Use @xenova/transformers with Xenova/all-MiniLM-L6-v2
- Singleton pipeline (lazy load)
- Function embed(text): Promise<number[]>

lib/ai/rag.ts:
- buildRAGContext(query, userId): 
  1. Embed query
  2. pgvector search: courseEmbeddings (top 5), redditEmbeddings (top 5)
  3. Format as context block
- Returns { context, sources }

lib/ai/prompts.ts:
- System prompts for each task
- Compass system prompt: "You are Compass, an AI assistant for Concordia SOEN students. Always cite sources. Be concise."

Env: GROQ_API_KEY GEMINI_API_KEY
```

### Prompt 10: Ask Compass chatbot

```
Build app/(dashboard)/chat/page.tsx using Vercel AI SDK.

Layout:
- Sidebar: conversation list (user's aiConversations)
- Main: messages + input
- Streaming responses with smooth typewriter

Use useChat() hook with custom API route /api/ai/chat (streaming SSE).

API route /api/ai/chat:
1. Rate limit check (50/day per user)
2. Save user message to aiMessages
3. Build RAG context (lib/ai/rag.ts)
4. Stream via lib/ai/provider.ts
5. Save assistant message + sources on completion
6. Update aiUsage

UI features:
- Source citations below each AI message (collapsible)
- 👍 / 👎 feedback buttons
- "Clear conversation" button
- Counter: "X / 50 messages today"
- Empty state: suggested questions
```

### Prompt 11: Semantic search command palette

```
Build components/command-palette.tsx with cmdk.

Trigger: ⌘K (Mac) / Ctrl+K (others)

Layout (Dialog):
- Search input at top
- Mode toggle: Keyword / Smart (semantic)
- Categorized results: Courses / Professors / Deadlines / Chat History / Pages

API /api/search:
- mode=keyword: Postgres ILIKE on code+title
- mode=semantic: embed query, pgvector cosine similarity on courseEmbeddings
- Returns top 10

Keyboard: arrows navigate, Enter selects, Esc closes.

Show recent searches when empty (from localStorage).

Mount in root layout so accessible everywhere.
```

### Prompt 12: Excel import

```
Build app/(dashboard)/settings/import/page.tsx.

UI: drag-drop zone, "Download template" link, preview table, "Confirm Import" button.

Server flow:
- POST /api/import/excel with FormData
- Parse with xlsx library
- Detect format (v6 vs generic) via tab names
- Validate each row with Zod
- Return preview { ok: [], errors: [], total }
- On confirm: create importJob (status: processing), process in background, update status when done

Preview UI:
- Table with all parsed courses
- Green ✓ valid / Red ✗ issues
- Tooltip on errors
- "Skip errors" checkbox

After commit: redirect to /plan with toast.

Also build CSV variant at /settings/import/csv using papaparse.
```

### Prompt 13: Crawlee scraper

```
Build scripts/scrape-concordia.ts.

Install: crawlee playwright

PlaywrightCrawler:
- Target: https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-...
- maxConcurrency: 2 (be respectful)
- 2s between requests
- User-Agent: 'SOEN-Compass-Bot/1.0 (+contact)'

For each course:
- Extract code, title, credits, description, prereq text
- Parse prereq text via lib/parsers/prereq.ts → structured { all, any, concurrent, notes }
- Diff against current courses table
- If changed: insert into scrapedChanges with status='pending'
- Regenerate embedding for changed courses

Schedule via Railway Cron service:
- Cron: 0 3 * * 0 (Sunday 3am UTC)
- Start command: npm run scrape:courses

Admin UI /admin/scraped-changes:
- List pending changes with diff view (old vs new JSON)
- Approve → updates courses table
- Reject → marks as rejected
- Bulk approve button
```

### Prompt 14: Sentry + PostHog + rate limiting

```
Add observability and rate limiting.

Sentry:
- npx @sentry/wizard@latest -i nextjs
- Configure source maps
- Error boundaries in app/error.tsx and route-level

PostHog:
- Install: posthog-js posthog-node
- lib/analytics.ts — wrapper for client + server
- PostHogProvider in app/layout.tsx
- Track: page_view, course_added, ai_message_sent, plan_validated, search_performed, profile_made_public, onboarding_completed, etc.

Rate limiting (lru-cache, no Redis):
- lib/rate-limit.ts
- rateLimitByUserId(userId, feature, limit, windowMs)
- rateLimitByIp(ip, feature, limit, windowMs)
- Apply to:
  * /api/ai/* — 50/day per user
  * /api/search — 100/hour per IP
  * /api/import/* — 5/hour per user
  * /api/moderation/flag — 10/day per user
  * Demo mode AI — 5/session per IP

Return 429 with Retry-After header. Show counters in UI.
```

### Prompt 15: Public profile + sharing

```
Build app/u/[slug]/page.tsx — PUBLIC (no auth).

Layout (max-w-3xl):
- Hero: avatar, name, program, expected grad, bio
- 4-card stats: Credits done, Year, Co-op (if showCoopStatus), Specialization
- Donut chart (Recharts PieChart): progress by category
- Sections (respect privacy toggles):
  - Completed Courses (always if isPublic)
  - Currently Taking
  - Planned (if showFuturePlan)
  - GPA (if showGpa)
- Connect: LinkedIn, GitHub, email icons
- "Download PDF" button → /api/export/pdf

generateMetadata:
- Title: "{name} — SOEN Compass"
- Description: "{program} student at Concordia"
- OG image: dynamic via @vercel/og at /og?slug={slug}

If !profile.isPublic, return notFound().
```

---

## 12. Folder Structure

> **Layout note:** All application code lives under `src/`. Path alias `@/*` maps to `./src/*` (configured in `tsconfig.json`). The tree below shows paths relative to repo root — actual `app/`, `components/`, `lib/`, etc. live inside `src/`.

```
soen-compass/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── scrape-courses.yml
│   └── ISSUE_TEMPLATE/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── onboarding/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── plan/page.tsx
│   │   ├── map/page.tsx
│   │   ├── requirements/page.tsx
│   │   ├── chat/page.tsx
│   │   ├── deadlines/page.tsx
│   │   ├── emails/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── profile/page.tsx
│   │       ├── public-profile/page.tsx
│   │       ├── import/page.tsx
│   │       └── privacy/page.tsx
│   ├── (admin)/admin/
│   │   ├── moderation/page.tsx
│   │   ├── scraped-changes/page.tsx
│   │   └── analytics/page.tsx
│   ├── u/[slug]/page.tsx
│   ├── demo/page.tsx
│   ├── api/
│   │   ├── auth/[...all]/route.ts
│   │   ├── plan/
│   │   ├── courses/
│   │   ├── ai/
│   │   │   ├── chat/route.ts
│   │   │   ├── recommend/route.ts
│   │   │   └── draft-email/route.ts
│   │   ├── search/route.ts
│   │   ├── import/
│   │   ├── export/
│   │   ├── moderation/
│   │   └── admin/
│   ├── og/route.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
├── components/
│   ├── ui/ (shadcn)
│   ├── course-card.tsx
│   ├── term-column.tsx
│   ├── prereq-graph.tsx
│   ├── credit-progress.tsx
│   ├── workload-badge.tsx
│   ├── command-palette.tsx
│   ├── ai-chat.tsx
│   ├── theme-toggle.tsx
│   ├── moderation/
│   └── nav/
├── lib/
│   ├── db/
│   ├── auth.ts
│   ├── auth-client.ts
│   ├── ai/
│   │   ├── provider.ts
│   │   ├── rag.ts
│   │   ├── embeddings.ts
│   │   └── prompts.ts
│   ├── validation/
│   ├── workload.ts
│   ├── rate-limit.ts
│   ├── analytics.ts
│   ├── importers/
│   ├── utils.ts
│   └── constants.ts
├── data/
│   ├── soen-courses.json
│   ├── deadlines.json
│   └── concordia-grade-scale.json
├── scripts/
│   ├── seed-courses.ts
│   ├── seed-deadlines.ts
│   ├── scrape-concordia.ts
│   ├── scrape-reddit.ts
│   └── generate-embeddings.ts
├── tests/
├── public/
├── .env.example
├── biome.json
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tsconfig.json
├── LICENSE
├── README.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── CLAUDE.md
└── PRD.md
```

---

## 13. Environment Variables

`.env.example`:

```bash
# === Database ===
DATABASE_URL="postgresql://user:password@host:5432/soen_compass"

# === Better Auth ===
BETTER_AUTH_SECRET="generate-with-openssl-rand-base64-32"
BETTER_AUTH_URL="http://localhost:3000"

# === Google OAuth ===
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"

# === AI Providers (free tiers) ===
# Groq: https://console.groq.com/keys (no credit card needed)
GROQ_API_KEY="gsk_xxx"

# Google Gemini: https://aistudio.google.com/app/apikey (free 1500 RPD)
GEMINI_API_KEY="xxx"

# === Reddit API (Phase 4) ===
REDDIT_CLIENT_ID=""
REDDIT_CLIENT_SECRET=""
REDDIT_USER_AGENT="SOEN-Compass-Bot/1.0"

# === Observability ===
NEXT_PUBLIC_SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
SENTRY_AUTH_TOKEN="sntrys_xxx"
NEXT_PUBLIC_POSTHOG_KEY="phc_xxx"
NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"

# === Admin ===
ADMIN_EMAIL="your-email@gmail.com"

# === Site ===
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

---

## 14. Deployment Guide

### 14.1 Railway setup

1. New Project → name "soen-compass"
2. Add Postgres service (auto-provisions, enable pgvector after deploy)
3. Add App service from GitHub repo
4. Variables: link DATABASE_URL to Postgres, add all from .env.example
5. Domains: use generated `*.up.railway.app`

### 14.2 Enable pgvector

After Postgres service is up:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run via Railway dashboard SQL console or first migration.

### 14.3 Cron service (Phase 4)

1. + New Service → Empty Service
2. Source: same repo
3. Start command: `npm run scrape:courses`
4. Cron: `0 3 * * 0` (Sunday 3am)

### 14.4 Run migrations

From local with DATABASE_URL set:

```bash
npm run db:migrate
npm run db:seed
```

### 14.5 Auto-deploy

Already enabled by default on every push to `main`.

---

## 15. Scraping Architecture

### 15.1 What we scrape

| Source | Frequency | Tool |
|---|---|---|
| Concordia Section 71.70.10 (courses) | Weekly | Crawlee + PlaywrightCrawler |
| Concordia Section 71.70.9 (requirements) | Monthly | Crawlee + CheerioCrawler |
| Reddit r/Concordia mentions | Daily | Reddit API |
| Concordia faculty pages (prof emails) | Monthly | Crawlee + CheerioCrawler |

### 15.2 What we DON'T scrape

| Target | Why | Alternative |
|---|---|---|
| RateMyProfessors | ToS prohibits | Link out via search URL |
| Studocu/CourseHero | Copyright | Direct users to source |

### 15.3 Admin review flow

1. Scraper runs Sunday 3am
2. Detects changes → inserts to `scrapedChanges` (status: pending)
3. Admin reviews at `/admin/scraped-changes`
4. Approve → updates `courses` table + regenerates embedding
5. Reject → discards

### 15.4 Implementation outline

See `scripts/scrape-concordia.ts` (built in Prompt 13).

---

## 16. AI Architecture

### 16.1 3-tier model routing

```typescript
// lib/ai/provider.ts
type AITask =
  | 'chat-simple' | 'chat-complex'
  | 'recommend' | 'reddit-summarize'
  | 'email-draft' | 'search';

function selectModel(task: AITask) {
  switch (task) {
    case 'chat-simple':
    case 'search':
      return 'llama-3.1-8b-instant'; // FAST tier
    case 'chat-complex':
    case 'recommend':
    case 'reddit-summarize':
    case 'email-draft':
      return 'llama-3.3-70b-versatile'; // SMART tier
  }
}

async function generateResponse(messages, task: AITask) {
  const model = selectModel(task);
  // v1: Groq only. On 429, retry with exponential backoff (1s, 2s, 4s),
  // then surface 503 to caller. Gemini fallback deferred — see ADR-012.
  return await callGroqWithBackoff(model, messages, { attempts: 3, baseMs: 1000 });
}
```

### 16.2 RAG pipeline

1. **Embed query:** sentence-transformers (all-MiniLM-L6-v2, 384 dims)
2. **Vector search:** pgvector cosine similarity
   - Top 5 from `courseEmbeddings`
   - Top 5 from `redditEmbeddings`
3. **Build context block:** structured markdown with source IDs
4. **Inject into prompt:** system + context + user message
5. **Stream response:** Vercel AI SDK
6. **Save sources:** to `aiMessages.contextSources`

### 16.3 Embeddings strategy

- Model: `Xenova/all-MiniLM-L6-v2` (384 dims, 80MB, runs in Node)
- Generate at scrape time (offline), store in pgvector HNSW index
- Embed user queries on-the-fly (~50ms)
- Total embeddings cost: $0 forever

### 16.4 Prompt templates

```typescript
// lib/ai/prompts.ts
export const PROMPTS = {
  compassSystem: `You are Compass, an AI assistant for Concordia BEng Software Engineering students.

You have access to:
- The official course catalog with prereqs
- Community difficulty ratings and reviews
- Recent r/Concordia threads about courses
- The student's personal degree plan

Always:
- Cite your sources at the end
- Be concise and student-friendly
- Use specific course codes (e.g., COMP 352)
- If unsure, say so — don't make up information`,

  recommendSystem: `Generate 5 course recommendations for this SOEN student based on their interests and current plan. For each course, provide a 1-sentence "why" explanation.`,

  emailDraftSystem: `Draft a professional, concise email to a university advisor. Use the student's context. Be respectful but direct.`,

  redditSummarizeSystem: `Summarize what r/Concordia students say about this course in 3-4 sentences. Indicate overall sentiment (positive/neutral/negative).`,
};
```

### 16.5 Usage cost tracking

Every AI call logs to `aiUsage`:
- userId, feature, model, tokensUsed, timestamp
- Daily aggregation for rate limiting
- Future: per-user cost dashboard (even though free, useful data)

---

## 17. Observability

### 17.1 Sentry (errors)

- Configure via `npx @sentry/wizard@latest -i nextjs`
- Source maps uploaded on build
- Error boundaries:
  - `app/error.tsx` (global)
  - `app/(dashboard)/error.tsx` (dashboard route group)
  - Per-route as needed
- Release tracking via Git SHA

### 17.2 PostHog (analytics)

Events to track:
- `page_view` (auto)
- `signup_started`, `signup_completed`
- `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`
- `course_added`, `course_moved`, `course_removed`
- `plan_validated`, `plan_exported_pdf`, `plan_exported_ics`
- `ai_chat_started`, `ai_chat_message_sent`, `ai_chat_feedback`
- `search_performed` (mode: keyword/semantic)
- `profile_made_public`, `profile_viewed_external`
- `excel_imported`, `csv_imported`
- `review_submitted`, `vote_submitted`, `content_flagged`

Properties: user program, year, feature flags.

### 17.3 Custom event dashboard

Admin page at `/admin/analytics` showing key metrics from PostHog API.

---

## 18. Privacy & Compliance

### 18.1 GDPR-style soft deletes

- `users.deletedAt` column
- Soft delete sets deletedAt timestamp
- Hard delete after 30 days (background job)
- User data export endpoint: `GET /api/profile/me/export` (returns JSON)

### 18.2 Public profile anonymization

- Public profiles never expose: email, studentId, gradePoint (unless `showGpa`)
- Anonymous reviews/votes: `isAnonymous: true` hides userId from display

### 18.3 Data deletion flow

1. Settings → Account → "Delete my account"
2. Confirmation modal with 2-step verification
3. Soft delete (`deletedAt` set)
4. User signed out
5. Background job purges in 30 days (cascade deletes via Drizzle)

### 18.4 Privacy policy + terms

- `/privacy` page: what we collect, how we use it
- `/terms` page: usage terms, content policies
- Cookie banner for non-essential tracking (PostHog)

---

## 19. Rate Limiting & Anti-Abuse

### 19.1 In-memory rate limiter

```typescript
// lib/rate-limit.ts
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, number[]>({ max: 10000, ttl: 1000 * 60 * 60 * 24 });

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (cache.get(key) ?? []).filter(t => now - t < windowMs);
  if (hits.length >= limit) {
    return { allowed: false, retryAfter: windowMs - (now - hits[0]) };
  }
  hits.push(now);
  cache.set(key, hits);
  return { allowed: true, remaining: limit - hits.length };
}
```

### 19.2 Limits per route

| Route | Limit | Window |
|---|---|---|
| `/api/ai/*` | 50 | 24h per user |
| Demo AI (anonymous) | 5 | per session per IP |
| `/api/search` | 100 | 1h per IP |
| `/api/import/*` | 5 | 1h per user |
| `/api/moderation/flag` | 10 | 24h per user |
| Auth endpoints | 10 | 1h per IP |

### 19.3 Anti-abuse measures

- Profanity filter on review/comment submit
- Min comment length 10 chars, max 1000
- One review per user per professor
- One difficulty vote per user per course (updatable)
- IP-based bot detection (block obvious scrapers)

---

## 20. Onboarding Wizard

### 20.1 5 steps

**Step 1: Welcome**
- Hero: "Let's set up your plan in 2 minutes"
- Description
- "Get Started" button

**Step 2: Profile**
- Program select (default SOEN-General)
- Entry term select (default current/next Fall)
- Student ID input (optional)

**Step 3: Interests**
- Multi-select chips:
  - AI/ML
  - Web Development
  - Mobile Development
  - Embedded Systems
  - Game Development
  - Security
  - Data Science
  - Robotics
  - DevOps/Cloud
- "These help personalize recommendations"

**Step 4: Existing data**
- Three cards:
  - 📊 Upload Excel (drag-drop, accepts .xlsx)
  - 🎓 Cégep transfer student (loads template)
  - ✨ Start fresh
- "Continue"

**Step 5: Done**
- Confetti animation
- "All set!"
- "Go to Dashboard"

### 20.2 Implementation notes

- Progress saved to `profiles.onboardingStep`
- Allow back / skip
- Skip step 3 (interests) only if user selected "Start fresh"
- Skip step 4 if user already has data

---

## 21. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘/` / `Ctrl+/` | Show all shortcuts |
| `g d` | Go to Dashboard |
| `g p` | Go to Plan |
| `g m` | Go to Map |
| `g c` | Go to Chat (Ask Compass) |
| `g s` | Go to Settings |
| `n` | New course (in Plan view) |
| `e` | Edit selected course |
| `Del` / `Backspace` | Delete selected |
| `?` | Show shortcuts modal |
| `Esc` | Close modals/sheets |
| `⌘Enter` / `Ctrl+Enter` | Send message (in chat) |

Show shortcuts modal triggered by `?`.

---

## 22. Testing Strategy

### 22.1 Unit (Vitest)
- `validatePlan()` — prereq rules
- `calculateGpa()` — grade math
- `parsePrereqText()` — text → structured
- `calculateTermWorkload()` — statistical
- `selectModel()` — AI routing

### 22.2 Components (Vitest + Testing Library)
- `<CourseCard />` — render, drag, click
- `<TermColumn />` — drops, totals
- `<CreditProgress />` — animations
- `<CommandPalette />` — search modes

### 22.3 E2E (Playwright)
- Signup → onboarding → first plan
- Drag course between terms
- Generate PDF export
- View public profile (no auth)
- Ask Compass chat flow

### 22.4 CI/CD

`.github/workflows/ci.yml`:
- On push + PR
- Steps: install → lint → typecheck → test → build
- Fail fast

---

## 23. Open Source Setup

### 23.1 README essentials
- Logo + tagline
- Live demo link
- Screenshots (3-4)
- Tech stack badges
- Quick start
- Contributing guide link
- License

### 23.2 LICENSE
MIT (most permissive).

### 23.3 Repository hygiene
- `main` branch protected (PRs only)
- Conventional Commits enforced
- Issue templates: Bug, Feature request
- PR template with checklist
- GitHub Discussions enabled

### 23.4 Discoverability
- Post to r/Concordia at launch
- Post to r/sideproject, r/nextjs
- GitHub topics: nextjs, concordia, education, degree-planner, ai
- Tweet with screenshots

---

## Appendix A: Quick Reference for Claude Code

1. Read relevant PRD section FIRST before implementing
2. TypeScript strict mode — no `any` types
3. Use shadcn/ui before building custom
4. Server Components by default; Client Components only when needed
5. Optimistic UI for all user actions
6. Skeleton loaders during data fetch
7. Toast feedback for every mutation
8. Accessibility check before merging
9. Mobile responsive at every step
10. Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)

## Appendix B: Common Pitfalls

- ❌ Don't use Pages Router — App Router only
- ❌ Don't use Prisma — Drizzle only
- ❌ Don't use Supabase — Better Auth + Railway Postgres
- ❌ Don't scrape RateMyProfessors — link out only
- ❌ Don't use `useEffect` for data fetching — RSC / Server Actions
- ❌ Don't install ESLint or Prettier — Biome handles both
- ❌ Don't use OpenAI/Anthropic APIs — Groq + Gemini are free
- ❌ Don't store secrets in Git — `.env` only
- ❌ Don't skip rate limiting on AI endpoints

---

## Sign-off

This PRD is the source of truth for SOEN Compass v1. Changes require updating this document with a `prd:` prefixed commit.

**Next step:** Open Claude Code in your project directory and run Prompt 1 from Section 11.

🚀 Let's ship this.
