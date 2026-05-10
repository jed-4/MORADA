-- Adds the cost_codes.is_labour flag introduced for the labour-hours
-- budget rewrite. Idempotent (IF NOT EXISTS) so it is safe to replay
-- against environments where db:push has already applied the column.
ALTER TABLE "cost_codes" ADD COLUMN IF NOT EXISTS "is_labour" boolean DEFAULT false NOT NULL;
