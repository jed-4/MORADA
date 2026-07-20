-- Tracks the last nightly bill reconciliation sweep per Xero connection, so the
-- scheduler runs about once a day and doesn't re-sweep on every tick.
ALTER TABLE "xero_connections" ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamp;
