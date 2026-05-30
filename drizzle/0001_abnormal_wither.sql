CREATE TABLE "brave_usage" (
	"month_key" text PRIMARY KEY NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"monthly_budget" integer DEFAULT 1000 NOT NULL,
	"last_request_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reddit_summaries" (
	"course_code" text PRIMARY KEY NOT NULL,
	"summary" jsonb NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"model" "ai_model",
	"tokens_used" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reddit_summaries" ADD CONSTRAINT "reddit_summaries_course_code_courses_code_fk" FOREIGN KEY ("course_code") REFERENCES "public"."courses"("code") ON DELETE cascade ON UPDATE no action;