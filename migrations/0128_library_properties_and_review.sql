-- Library: Notion-style properties, SOP review dates, two document types.
--
-- 1. library_properties — a company's properties (Settings → Library, or the
--    Library's ⋮ menu). kind 'select' = one choice, 'tags' = several; options
--    is [{ id, label, color }].
-- 2. docs.properties — { propertyId: optionId | optionId[] }.
-- 3. docs.review_due_at — when an SOP is next due for review ("overdue" flag).
-- 4. Two types only (Jed, 2026-11-15): policy / template / checklist /
--    reference documents become plain 'document'. Data change, but nothing is
--    lost — those types already rendered as "Document" since #404.
--
-- 0125–0127 are #399 / #401 / #406. Additive and idempotent (step 4 is a
-- no-op on a re-run).

CREATE TABLE IF NOT EXISTS library_properties (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'tags',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_properties_company_idx ON library_properties (company_id);

ALTER TABLE docs ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS review_due_at timestamp;

UPDATE docs SET doc_type = 'document' WHERE doc_type IN ('policy', 'template', 'checklist', 'reference');
