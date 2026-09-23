-- Cashflow forecast — PR 4 of 7: claims linked to the schedule.
--
-- A job's claim schedule for the forecast. Seeded from the accepted
-- proposal's payment milestones (which have no dates), then each stage can be
-- linked to a schedule item: the claim lands when that item finishes, plus the
-- client's pay days. Stages are consumed in order by the claim % already
-- invoiced, so issuing an invoice needs no change here.
--
-- One new table; nothing existing is altered. Needs 0088.

CREATE TABLE IF NOT EXISTS project_claim_stages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  percent double precision,
  amount_cents integer,
  schedule_item_id varchar REFERENCES schedule_items(id) ON DELETE SET NULL,
  planned_date text,
  source_milestone_id varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_claim_stages_project_idx ON project_claim_stages (project_id);
