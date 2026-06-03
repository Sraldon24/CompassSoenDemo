CREATE TABLE "ai_review_cache" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_hash" text NOT NULL,
	"suggestions" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_review_cache" ADD CONSTRAINT "ai_review_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;