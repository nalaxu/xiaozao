ALTER TABLE "followups" ADD COLUMN "step" smallint;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "with_photo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "last_cuisines" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "preferences" SET "last_cuisines" = ARRAY["last_cuisine"] WHERE "last_cuisine" IS NOT NULL;
