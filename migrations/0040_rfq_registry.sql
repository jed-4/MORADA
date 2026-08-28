-- RFQs as a company-wide registry.
--
-- 1. project_id becomes nullable. The RFQ list spans projects, and a builder
--    needs to log "I emailed three concreters about the Smith job before we
--    won it" without a project record existing yet. Numbering is already
--    company-scoped (migration 0038), so a project-less RFQ still gets a
--    stable number.
--
-- 2. owner_id / owner_name record who is chasing the RFQ. Distinct from
--    created_by: the person who logs an enquiry is often not the person
--    responsible for getting an answer, and a shared registry needs a name
--    against each row for a chase to mean anything.

ALTER TABLE rfqs ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE rfqs
  ADD COLUMN IF NOT EXISTS owner_id varchar REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_name text;

-- Backfill: the creator owns what they created until someone reassigns it, so
-- no existing row shows up unowned in the registry.
UPDATE rfqs r
SET owner_id = r.created_by,
    owner_name = NULLIF(r.created_by_name, '')
WHERE r.owner_id IS NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.created_by);

-- Registry reads are company-wide and sorted by what is outstanding.
CREATE INDEX IF NOT EXISTS rfqs_company_status_due_idx
  ON rfqs (company_id, status, due_date);
