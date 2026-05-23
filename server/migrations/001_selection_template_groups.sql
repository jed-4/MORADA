-- Migration: Flatten Selection Templates model
-- Creates selection_template_groups and selection_template_group_memberships tables,
-- then backfills existing groupId FK data into the junction table.
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- 1. Create the groups lookup table
CREATE TABLE IF NOT EXISTS selection_template_groups (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Create the many-to-many junction table
CREATE TABLE IF NOT EXISTS selection_template_group_memberships (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR NOT NULL REFERENCES selection_templates(id) ON DELETE CASCADE,
  group_id VARCHAR NOT NULL REFERENCES selection_template_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Add unique constraint to prevent duplicate memberships
CREATE UNIQUE INDEX IF NOT EXISTS selection_template_group_memberships_template_group_unique
  ON selection_template_group_memberships (template_id, group_id);

-- 4. Backfill existing groupId FK data into the junction table
-- (selection_templates.group_id is the legacy column; kept in DB for backward compatibility)
INSERT INTO selection_template_group_memberships (template_id, group_id)
SELECT id, group_id
FROM selection_templates
WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;
