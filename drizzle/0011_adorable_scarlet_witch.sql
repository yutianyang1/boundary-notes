ALTER TABLE "categories" ADD COLUMN "name_en" varchar(120);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "name_en" varchar(120);--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "name_en" varchar(120);