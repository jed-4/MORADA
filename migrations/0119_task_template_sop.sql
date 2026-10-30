-- Operations Phase 3: link a task template to the Library doc (usually an SOP)
-- that explains how to do it. Every To-Do generated from the template shows it
-- as "View SOP". Deleting the doc unlinks it; the template stays.
--
-- Additive and idempotent. Needs 0118 (docs.id is the target).

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS sop_doc_id varchar REFERENCES docs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS task_templates_sop_doc_idx ON task_templates (sop_doc_id) WHERE sop_doc_id IS NOT NULL;
