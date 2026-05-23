-- Migration: Flatten Selection Templates model
-- Additive only — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- Safe to run multiple times against any environment state.

-- 1. Create the groups lookup table (includes sort_order to match Drizzle schema)
CREATE TABLE IF NOT EXISTS selection_template_groups (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Ensure sort_order column exists (for DBs that had the table before this column was added)
ALTER TABLE selection_template_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 3. Create the many-to-many junction table
CREATE TABLE IF NOT EXISTS selection_template_group_memberships (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR NOT NULL REFERENCES selection_templates(id) ON DELETE CASCADE,
  group_id VARCHAR NOT NULL REFERENCES selection_template_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Add unique constraint to prevent duplicate memberships
CREATE UNIQUE INDEX IF NOT EXISTS selection_template_group_memberships_template_group_unique
  ON selection_template_group_memberships (template_id, group_id);

-- 5. Add flat per-template metadata columns to selection_templates
ALTER TABLE selection_templates ADD COLUMN IF NOT EXISTS room TEXT;
ALTER TABLE selection_templates ADD COLUMN IF NOT EXISTS allowance_type TEXT;
ALTER TABLE selection_templates ADD COLUMN IF NOT EXISTS budget_amount INTEGER;
ALTER TABLE selection_templates ADD COLUMN IF NOT EXISTS client_can_see_price BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE selection_templates ADD COLUMN IF NOT EXISTS client_can_change BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE selection_templates ADD COLUMN IF NOT EXISTS deadline TEXT;

-- 6. Backfill existing groupId FK data into the junction table
-- (selection_templates.group_id is the legacy column; kept in DB for backward compat)
INSERT INTO selection_template_group_memberships (template_id, group_id)
SELECT id, group_id
FROM selection_templates
WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;
