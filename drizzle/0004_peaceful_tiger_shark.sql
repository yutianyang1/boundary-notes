CREATE TABLE "post_view_counts" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_view_counts" ADD CONSTRAINT "post_view_counts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_view_counts_ranking_idx" ON "post_view_counts" USING btree ("view_count");