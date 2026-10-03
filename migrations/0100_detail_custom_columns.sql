-- Columns of your own on the Details list, in an estimate and in a template.
--
-- A Details row has always been a fixed shape: the estimate's rows carry Req?,
-- Brainstorm Notes, RFI, RFQ, RFQ Date, Labour, Estimator Notes, Status and
-- Done, and the TEMPLATE rows carry only a category and some notes. Builders
-- track things those columns do not cover — a trade, a responsible person, a
-- lead time — and had nowhere to put them.
--
-- Definitions are per COMPANY, so a column added once shows up on every estimate
-- and every template rather than being rebuilt each time. Note the existing
-- custom_field_defs table is NOT reused: it has no company_id at all (its `key`
-- is globally unique), so extending it would spread a tenancy hole rather than
-- contain one.
--
-- Values live in a jsonb column on the row itself, keyed by definition id. That
-- is the same shape tasks already use for their custom fields, and it means a
-- value travels with its row: applying a template copies the blob, and deleting
-- a definition leaves a harmless orphan key rather than a dangling join row.

CREATE TABLE IF NOT EXISTS detail_field_defs (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label         text NOT NULL,
  -- text | checkbox | date | select. Anything unknown renders as text rather
  -- than disappearing, so a future type cannot silently hide someone's data.
  type          text NOT NULL DEFAULT 'text',
  -- Only for `select`: a plain array of choices, not a second table. One screen
  -- of options does not warrant its own CRUD.
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS detail_field_defs_company_idx
  ON detail_field_defs (company_id, display_order);

-- Values, keyed by detail_field_defs.id.
ALTER TABLE estimate_enotes
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE enote_templates
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
