ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_bot" boolean DEFAULT false NOT NULL;
