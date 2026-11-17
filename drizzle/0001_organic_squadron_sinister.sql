ALTER TABLE "recommendation_runs" ADD COLUMN "dishes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "tutorials_run_dish_idx" ON "tutorials" USING btree ("run_id","dish_id");