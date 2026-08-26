-- Field Settings were GLOBAL: field_categories.key was uniquely constrained
-- across the whole instance and neither table carried a company_id, so every
-- company on the deployment shared one list of units, statuses, rooms, etc.
-- Any customer's admin editing an option changed it for every other customer
-- (and /options/quick-add needed only team-member, not admin).
--
-- This gives every company its own copy.
--
-- Safe because NO business table references field_options.id — estimate_items
-- stores the unit NAME, allowance_status stores the option KEY, and so on. The
-- only FKs into these tables are field_options.category_id and the
-- field_options.parent_id self-reference, both remapped below.
--
-- Cloned ids are deterministic — md5(company_id || original_id) — so
-- category_id and parent_id remap without a temporary mapping table.
--
-- ALREADY APPLIED ON THE DEV DATABASE (ahead of the code — that is why the
-- routes could read every tenant's rows). Re-running it there is a no-op.
-- PROD HAS NOT HAD IT: apply this BEFORE deploying, or every field-settings
-- query 500s on a missing column.

ALTER TABLE field_categories ADD COLUMN IF NOT EXISTS company_id VARCHAR;
ALTER TABLE field_options   ADD COLUMN IF NOT EXISTS company_id VARCHAR;

-- Drop the GLOBAL unique on key FIRST — every company's clone reuses the same
-- key ("estimate_item.unit" etc.), so the clone step below cannot run while it
-- is still in place. The per-company replacement is added at the end.
ALTER TABLE field_categories DROP CONSTRAINT IF EXISTS field_categories_key_unique;

-- 1. One copy of every category per company.
INSERT INTO field_categories
  (id, key, label, entity, description, is_built_in, is_active, sort_order, created_at, updated_at, company_id)
SELECT md5(c.id || fc.id), fc.key, fc.label, fc.entity, fc.description,
       fc.is_built_in, fc.is_active, fc.sort_order, fc.created_at, NOW(), c.id
FROM field_categories fc
CROSS JOIN companies c
WHERE fc.company_id IS NULL;

-- 2. One copy of every option per company, with category_id and parent_id
--    remapped onto that company's cloned rows.
INSERT INTO field_options
  (id, category_id, parent_id, key, name, description, color, system_phase,
   is_active, is_default, is_completed, is_actionable, sort_order, created_at, updated_at, company_id)
SELECT md5(c.id || fo.id),
       md5(c.id || fo.category_id),
       CASE WHEN fo.parent_id IS NULL THEN NULL ELSE md5(c.id || fo.parent_id) END,
       fo.key, fo.name, fo.description, fo.color, fo.system_phase,
       fo.is_active, fo.is_default, fo.is_completed, fo.is_actionable,
       fo.sort_order, fo.created_at, NOW(), c.id
FROM field_options fo
CROSS JOIN companies c
WHERE fo.company_id IS NULL;

-- 3. Drop the now-replaced global rows (options cascade from their category,
--    but delete explicitly so the intent is on the record).
DELETE FROM field_options    WHERE company_id IS NULL;
DELETE FROM field_categories WHERE company_id IS NULL;

-- 4. Lock it in: every row belongs to a company, and `key` is unique per
--    company rather than globally.
ALTER TABLE field_categories ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE field_options    ALTER COLUMN company_id SET NOT NULL;

-- Unique INDEX (not constraint) to match how every other composite unique in
-- shared/schema.ts is declared — drizzle emits uniqueIndex for these.
CREATE UNIQUE INDEX IF NOT EXISTS field_categories_company_key_unique
  ON field_categories (company_id, key);

-- Guarded so the whole file is re-runnable: ADD CONSTRAINT has no IF NOT
-- EXISTS, and this migration is applied by hand (see replit.md), so a second
-- run must be a no-op rather than an error. Every other statement here is
-- already idempotent.
DO $$ BEGIN
  ALTER TABLE field_categories
    ADD CONSTRAINT field_categories_company_id_fk
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE field_options
    ADD CONSTRAINT field_options_company_id_fk
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS field_categories_company_idx ON field_categories (company_id);
CREATE INDEX IF NOT EXISTS field_options_company_idx    ON field_options (company_id);
