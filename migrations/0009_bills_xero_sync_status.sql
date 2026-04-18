-- Add Xero sync status columns to bills (task #115)
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "xero_last_sync_at" timestamp;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "xero_last_sync_status" text;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "xero_last_sync_error" text;
