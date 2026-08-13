CREATE TABLE "post_view_daily" (
	"post_id" uuid NOT NULL,
	"day" date NOT NULL,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_view_daily_post_id_day_pk" PRIMARY KEY("post_id","day")
);
--> statement-breakpoint
ALTER TABLE "post_view_daily" ADD CONSTRAINT "post_view_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_view_daily_day_count_idx" ON "post_view_daily" USING btree ("day","view_count");