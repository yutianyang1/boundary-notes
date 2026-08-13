CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "posts_summary_trgm_idx" ON "posts" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "posts_content_md_trgm_idx" ON "posts" USING gin ("content_md" gin_trgm_ops);
