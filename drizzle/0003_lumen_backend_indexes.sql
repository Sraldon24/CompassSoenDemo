ALTER TYPE "public"."ai_model" ADD VALUE 'gemini-2.5-flash' BEFORE 'cached';--> statement-breakpoint
CREATE INDEX "idx_ai_messages_conversation" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_difficulty_votes_course" ON "difficulty_votes" USING btree ("course_code");--> statement-breakpoint
CREATE INDEX "idx_moderation_flags_status" ON "moderation_flags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_moderation_flags_entity" ON "moderation_flags" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_prof_reviews_course_status" ON "professor_reviews" USING btree ("course_code","moderation_status");--> statement-breakpoint
CREATE INDEX "idx_prof_reviews_professor" ON "professor_reviews" USING btree ("professor_id");--> statement-breakpoint
--> Dedupe existing professors by lower(name) BEFORE the unique index, so the
--> index can't fail on pre-existing case-insensitive duplicates (the exact bug
--> this index prevents going forward). Reviews are re-pointed to the surviving
--> (earliest) row so a professor's aggregates are merged, not lost.
UPDATE "professor_reviews" pr
SET "professor_id" = keep.keep_id
FROM (
  SELECT id AS dup_id,
         first_value(id) OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS keep_id
  FROM "professors"
) keep
WHERE pr."professor_id" = keep.dup_id AND keep.dup_id <> keep.keep_id;--> statement-breakpoint
DELETE FROM "professors" p
USING (
  SELECT id,
         first_value(id) OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS keep_id
  FROM "professors"
) d
WHERE p.id = d.id AND d.id <> d.keep_id;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_professors_name_lower" ON "professors" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "idx_reddit_posts_course" ON "reddit_posts" USING btree ("course_code");--> statement-breakpoint
CREATE INDEX "idx_scraped_changes_status" ON "scraped_changes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_usage_events_name_time" ON "usage_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_courses_user" ON "user_courses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_courses_course" ON "user_courses" USING btree ("course_code");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");