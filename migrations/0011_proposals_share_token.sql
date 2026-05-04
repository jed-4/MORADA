ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "share_token" varchar NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_share_token_unique') THEN
  ALTER TABLE "proposals" ADD CONSTRAINT "proposals_share_token_unique" UNIQUE ("share_token");
 END IF;
END $$;
