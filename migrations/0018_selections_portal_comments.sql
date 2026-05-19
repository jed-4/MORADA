-- Adds portal token, portal sent-at, and selection_comments table.
-- Idempotent (IF NOT EXISTS / IF NOT EXISTS column) so it is safe to replay.

ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "portal_token" varchar UNIQUE;
ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "portal_sent_at" timestamp;

CREATE TABLE IF NOT EXISTS "selection_comments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "selection_id" varchar NOT NULL REFERENCES "selections"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "attachment_urls" text[] NOT NULL DEFAULT '{}',
  "attachment_file_names" text[] NOT NULL DEFAULT '{}',
  "created_by_id" varchar REFERENCES "users"("id"),
  "created_by_name" text,
  "is_client_comment" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
