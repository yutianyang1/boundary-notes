ALTER TABLE "post_revisions" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD COLUMN "series_order" integer;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;