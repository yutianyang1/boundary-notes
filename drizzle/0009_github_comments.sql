ALTER TABLE "comments" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "status" SET DEFAULT 'approved';
--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN "author_name";
--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN "author_email";
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "comments_user_id_idx" ON "comments" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_depth_check" CHECK ("comments"."depth" between 0 and 1);
