-- Task #238 — User Workspace overhaul
-- Additive: dashboard_type enum, dashboard_views.dashboard_type + user_id, user_memos table.
-- Idempotent: safe to run on environments where prior schema changes were
-- already applied directly via psql (the workspace's drizzle-kit push is
-- currently blocked by an unrelated pre-existing scope_stages index issue).

-- 1. dashboard_type enum
DO $$ BEGIN
    CREATE TYPE "public"."dashboard_type" AS ENUM ('business', 'project', 'user_workspace');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. dashboard_views additions
ALTER TABLE "dashboard_views"
    ADD COLUMN IF NOT EXISTS "dashboard_type" "dashboard_type" NOT NULL DEFAULT 'business';

ALTER TABLE "dashboard_views"
    ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_dashboard_views_dashboard_type"
    ON "dashboard_views" ("dashboard_type");

CREATE INDEX IF NOT EXISTS "idx_dashboard_views_user"
    ON "dashboard_views" ("company_id", "dashboard_type", "user_id");

-- 3. user_memos table (new — personal sticky notes for the user workspace)
CREATE TABLE IF NOT EXISTS "user_memos" (
    "id"          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"     varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "company_id"  varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "content"     text    NOT NULL,
    "pinned"      boolean NOT NULL DEFAULT false,
    "sort_order"  integer NOT NULL DEFAULT 0,
    "created_at"  timestamp NOT NULL DEFAULT now(),
    "updated_at"  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_memos_user"
    ON "user_memos" ("user_id", "company_id");

CREATE INDEX IF NOT EXISTS "idx_user_memos_pinned"
    ON "user_memos" ("user_id", "pinned", "sort_order");
