-- Adds approval and lock columns to selection_options for the Selections Module approval workflow.
-- Idempotent (IF NOT EXISTS) so it is safe to replay against environments
-- where drizzle-kit push has already applied the columns.
ALTER TABLE "selection_options" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
ALTER TABLE "selection_options" ADD COLUMN IF NOT EXISTS "approved_by_id" varchar REFERENCES "users"("id");
ALTER TABLE "selection_options" ADD COLUMN IF NOT EXISTS "approved_by" text;
ALTER TABLE "selection_options" ADD COLUMN IF NOT EXISTS "locked_at" timestamp;
