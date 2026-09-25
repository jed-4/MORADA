-- Schedule templates become real schedules.
--
-- A schedule template used to keep its items in one untyped JSON array
-- (schedule_templates.template_data), so the template page could not use the
-- project schedule and grew a cut-down copy of it. From here a template owns an
-- ordinary `schedules` row, and its items are ordinary `schedule_items`, so the
-- same page, routes, dependency cascade, steps and checklists work for both.
--
--   schedules.project_id   now NULLABLE — a template's schedule has no project.
--   schedules.template_id  the owning template. Deleting the template deletes
--                          its schedule, and so its items (existing cascade).
--   schedules_owner_check  exactly one of project_id / template_id is set.
--
-- Existing templates are NOT converted here. Their template_data is turned into
-- rows by the server the first time the template is opened or applied
-- (convertLegacyTemplate), because that needs working-day date math the SQL
-- side doesn't have. template_data stays as it was, as a backup.
--
-- Additive for every existing row: all current schedules have a project_id,
-- so the CHECK holds. Apply BEFORE deploying — the server selects template_id.

ALTER TABLE schedules ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS template_id varchar
  REFERENCES schedule_templates(id) ON DELETE CASCADE;

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_owner_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_owner_check
  CHECK ((project_id IS NULL) <> (template_id IS NULL));

-- One schedule per template.
CREATE UNIQUE INDEX IF NOT EXISTS schedules_template_id_unique
  ON schedules(template_id) WHERE template_id IS NOT NULL;
