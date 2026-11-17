ALTER TABLE "tutorials" ADD COLUMN "cooked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "favorites_user_idx" ON "favorites" USING btree ("user_id","created_at");