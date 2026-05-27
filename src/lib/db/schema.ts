/**
 * Drizzle schema for SOEN Compass.
 *
 * Single source of truth for the database. Generated migrations live in `drizzle/`.
 * Adapted from PRD §3 with plural table names (PRD convention) and Better Auth-compatible
 * column shapes on `users`, `sessions`, `accounts`, `verifications`.
 *
 * Better Auth's drizzleAdapter is configured to map its singular table names
 * (user, session, account, verification) to these plural names — see `src/lib/auth.ts`.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUMS
// ============================================================================

export const courseStatusEnum = pgEnum("course_status", [
  "planned",
  "enrolled",
  "completed",
  "transferred",
  "dropped",
  "disc",
  "failed",
]);

export const programEnum = pgEnum("program", [
  "SOEN-General",
  "SOEN-AvionicsEmbedded",
  "SOEN-Web",
  "SOEN-RealTime",
]);

export const courseCategoryEnum = pgEnum("course_category", [
  "eng_core",
  "se_core",
  "eng_nsci_group",
  "nat_sci_elective",
  "soen_elective",
  "gen_ed_humanities",
  "deficiency",
]);

export const difficultyVoteEnum = pgEnum("difficulty_vote", ["easy", "medium", "hard"]);

export const moderationStatusEnum = pgEnum("moderation_status", [
  "active",
  "flagged",
  "hidden",
  "deleted",
]);

export const aiModelEnum = pgEnum("ai_model", [
  "groq-llama-3.1-8b",
  "groq-llama-3.3-70b",
  "gemini-2.0-flash",
  "cached",
]);

// ============================================================================
// USERS (managed by Better Auth)
// Plural name per PRD; Better Auth singular `user` aliased via config.
// ============================================================================

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  name: text("name"),
  image: text("image"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"), // hashed by Better Auth (Argon2id)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// PROFILES
// ============================================================================

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id"),
  program: programEnum("program").default("SOEN-General"),
  entryTerm: text("entry_term"),
  expectedGraduation: text("expected_graduation"),
  isPublic: boolean("is_public").default(false).notNull(),
  publicSlug: text("public_slug").unique(),
  showGpa: boolean("show_gpa").default(false).notNull(),
  showDeficiencies: boolean("show_deficiencies").default(false).notNull(),
  showFuturePlan: boolean("show_future_plan").default(true).notNull(),
  showCoopStatus: boolean("show_coop_status").default(false).notNull(),
  inCoopProgram: boolean("in_coop_program").default(false).notNull(),
  coopApplicationStatus: text("coop_application_status"),
  interests: jsonb("interests").$type<string[]>(),
  careerGoal: text("career_goal"),
  bio: text("bio"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingStep: integer("onboarding_step").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// COURSES + EMBEDDINGS
// ============================================================================

export const courses = pgTable("courses", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  credits: real("credits").notNull(),
  description: text("description"),
  category: courseCategoryEnum("category"),
  group: text("group"),
  prereqs: jsonb("prereqs").$type<{
    all?: string[];
    any?: string[];
    concurrent?: string[];
    notes?: string;
  }>(),
  coreqs: jsonb("coreqs").$type<string[]>(),
  offeredFall: boolean("offered_fall").default(true).notNull(),
  offeredWinter: boolean("offered_winter").default(true).notNull(),
  offeredSummer: boolean("offered_summer").default(false).notNull(),
  difficultyAvg: real("difficulty_avg"),
  totalDifficultyVotes: integer("total_difficulty_votes").default(0).notNull(),
  avgHoursPerWeek: real("avg_hours_per_week"),
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const courseEmbeddings = pgTable(
  "course_embeddings",
  {
    courseCode: text("course_code")
      .primaryKey()
      .references(() => courses.code, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 384 }),
    embeddingText: text("embedding_text"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    embeddingIdx: index("idx_course_embedding").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);

// ============================================================================
// USER PLAN (user_courses)
// ============================================================================

export const userCourses = pgTable("user_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  courseCode: text("course_code")
    .references(() => courses.code)
    .notNull(),
  status: courseStatusEnum("status").default("planned").notNull(),
  term: text("term"),
  year: integer("year"),
  grade: text("grade"),
  gradePoint: real("grade_point"),
  isDeficiency: boolean("is_deficiency").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// DEADLINES + CHECKLIST
// ============================================================================

export const deadlines = pgTable("deadlines", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: text("category"),
  date: timestamp("date").notNull(),
  description: text("description"),
  url: text("url"),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurrenceRule: text("recurrence_rule"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  task: text("task").notNull(),
  category: text("category"),
  dueDate: timestamp("due_date"),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// COMMUNITY: difficulty votes, professor reviews
// ============================================================================

export const difficultyVotes = pgTable(
  "difficulty_votes",
  {
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    courseCode: text("course_code")
      .references(() => courses.code)
      .notNull(),
    vote: difficultyVoteEnum("vote").notNull(),
    term: text("term"),
    instructor: text("instructor"),
    comment: text("comment"),
    moderationStatus: moderationStatusEnum("moderation_status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.courseCode] }),
  }),
);

export const professors = pgTable("professors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  department: text("department"),
  email: text("email"),
  externalUrl: text("external_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const professorReviews = pgTable("professor_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  professorId: uuid("professor_id")
    .references(() => professors.id)
    .notNull(),
  courseCode: text("course_code").references(() => courses.code),
  rating: integer("rating").notNull(),
  difficulty: integer("difficulty"),
  term: text("term"),
  wouldTakeAgain: boolean("would_take_again"),
  comment: text("comment"),
  isAnonymous: boolean("is_anonymous").default(true).notNull(),
  moderationStatus: moderationStatusEnum("moderation_status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const moderationFlags = pgTable("moderation_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: text("reporter_id")
    .references(() => users.id)
    .notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// AI CONVERSATIONS + USAGE
// ============================================================================

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .references(() => aiConversations.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: aiModelEnum("model"),
  tokensUsed: integer("tokens_used"),
  contextSources: jsonb("context_sources").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    feature: text("feature").notNull(),
    model: aiModelEnum("model"),
    tokensUsed: integer("tokens_used").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index("idx_ai_usage_user_date").on(table.userId, table.createdAt),
  }),
);

// ============================================================================
// IMPORTS + USAGE EVENTS
// ============================================================================

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  source: text("source").notNull(),
  filename: text("filename"),
  status: text("status").default("pending").notNull(),
  rowsProcessed: integer("rows_processed").default(0).notNull(),
  rowsImported: integer("rows_imported").default(0).notNull(),
  errors: jsonb("errors").$type<{ row: number; message: string }[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id),
  sessionId: text("session_id"),
  eventName: text("event_name").notNull(),
  properties: jsonb("properties"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SCRAPING + REDDIT (Phase 4)
// ============================================================================

export const scrapedChanges = pgTable("scraped_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  changeType: text("change_type").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  status: text("status").default("pending").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const redditPosts = pgTable("reddit_posts", {
  id: text("id").primaryKey(),
  courseCode: text("course_code").references(() => courses.code),
  title: text("title").notNull(),
  body: text("body"),
  author: text("author"),
  score: integer("score"),
  numComments: integer("num_comments"),
  url: text("url"),
  postedAt: timestamp("posted_at"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export const redditEmbeddings = pgTable(
  "reddit_embeddings",
  {
    postId: text("post_id")
      .primaryKey()
      .references(() => redditPosts.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 384 }),
  },
  (table) => ({
    embeddingIdx: index("idx_reddit_embedding").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  sessions: many(sessions),
  accounts: many(accounts),
  courses: many(userCourses),
  checklistItems: many(checklistItems),
  difficultyVotes: many(difficultyVotes),
  professorReviews: many(professorReviews),
  aiConversations: many(aiConversations),
  importJobs: many(importJobs),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  embedding: one(courseEmbeddings),
  userCourses: many(userCourses),
  difficultyVotes: many(difficultyVotes),
  professorReviews: many(professorReviews),
}));

export const courseEmbeddingsRelations = relations(courseEmbeddings, ({ one }) => ({
  course: one(courses, { fields: [courseEmbeddings.courseCode], references: [courses.code] }),
}));

export const userCoursesRelations = relations(userCourses, ({ one }) => ({
  user: one(users, { fields: [userCourses.userId], references: [users.id] }),
  course: one(courses, { fields: [userCourses.courseCode], references: [courses.code] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export const professorsRelations = relations(professors, ({ many }) => ({
  reviews: many(professorReviews),
}));

export const professorReviewsRelations = relations(professorReviews, ({ one }) => ({
  user: one(users, { fields: [professorReviews.userId], references: [users.id] }),
  professor: one(professors, {
    fields: [professorReviews.professorId],
    references: [professors.id],
  }),
  course: one(courses, { fields: [professorReviews.courseCode], references: [courses.code] }),
}));

export const redditPostsRelations = relations(redditPosts, ({ one }) => ({
  course: one(courses, { fields: [redditPosts.courseCode], references: [courses.code] }),
  embedding: one(redditEmbeddings),
}));

export const redditEmbeddingsRelations = relations(redditEmbeddings, ({ one }) => ({
  post: one(redditPosts, { fields: [redditEmbeddings.postId], references: [redditPosts.id] }),
}));
