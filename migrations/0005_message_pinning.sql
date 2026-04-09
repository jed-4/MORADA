ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_pinned" boolean NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "pinned_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL;
