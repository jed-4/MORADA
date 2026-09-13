-- Proposal templates get a table, like the other eighteen template types.
--
-- They have been living as a jsonb ARRAY on company_settings, which has one
-- practical consequence beyond the inconsistency: saving any template rewrites
-- every template, so two people editing different templates in the same
-- company silently clobber each other. A row per template ends that, and
-- brings the metadata (updated_at, created_by, is_active) the array could
-- never carry.
--
-- Additive and idempotent. The jsonb column is deliberately NOT dropped here:
-- the copy below can be re-run, and nothing is destroyed if the deploy has to
-- be rolled back to code that still reads the array. Dropping it is a separate
-- migration once this has been live for a release.

CREATE TABLE IF NOT EXISTS proposal_templates (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  -- The document itself: the same shape proposal_sections has, minus the ids
  -- and the proposal_id, so applying a template is a straight insert.
  sections        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The Layout panel's settings, stored exactly as proposals.layout_settings.
  layout_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_by_id   varchar REFERENCES users(id),
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);

-- Listing is always "this company's templates, by name".
CREATE INDEX IF NOT EXISTS proposal_templates_company_idx
  ON proposal_templates (company_id, name);

-- Carry across whatever is already in the array.
--
-- Keyed on (company_id, name) so a re-run updates rather than duplicates —
-- the array's own `id` is a client-generated string that no longer means
-- anything once each template is a row with its own uuid.
INSERT INTO proposal_templates (company_id, name, sections, layout_settings)
SELECT
  cs.company_id,
  coalesce(nullif(trim(t.value ->> 'name'), ''), 'Untitled template'),
  coalesce(t.value -> 'sections', '[]'::jsonb),
  coalesce(t.value -> 'layoutSettings', '{}'::jsonb)
FROM company_settings cs
CROSS JOIN LATERAL jsonb_array_elements(coalesce(cs.proposal_templates, '[]'::jsonb)) AS t(value)
WHERE cs.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM proposal_templates existing
    WHERE existing.company_id = cs.company_id
      AND existing.name = coalesce(nullif(trim(t.value ->> 'name'), ''), 'Untitled template')
  );
