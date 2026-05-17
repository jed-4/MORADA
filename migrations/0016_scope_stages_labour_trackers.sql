-- Adds the scope_stages.labour_trackers column for the Scope Stage Labour Hours Counter.
-- Stores an array of pinned labour cost code IDs per stage as JSONB.
-- Idempotent (IF NOT EXISTS) so it is safe to replay against environments
-- where drizzle-kit push has already applied the column.
ALTER TABLE "scope_stages" ADD COLUMN IF NOT EXISTS "labour_trackers" jsonb DEFAULT '[]'::jsonb NOT NULL;
