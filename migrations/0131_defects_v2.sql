-- Defects v2, stage 1 (docs/DEFECTS_V2.md).
--
-- Adds the fixed workflow stage, per-project numbering (D-014), job stage,
-- internal owner, a per-project location tree, watchers and an event log.
-- The legacy `status` column stays and the app keeps it in sync.
--
-- Additive and idempotent: safe to run twice. Apply to PROD BEFORE deploying
-- the code — the new routes read every column below.

-- ── defects: new columns ───────────────────────────────────────────────────
ALTER TABLE defects ADD COLUMN IF NOT EXISTS company_id varchar REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS number integer;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'open';
ALTER TABLE defects ADD COLUMN IF NOT EXISTS job_stage text NOT NULL DEFAULT 'construction';
ALTER TABLE defects ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS location_id varchar;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS client_request_id varchar;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS closed_at timestamp;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS closed_by varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS closed_by_name text;

-- ── project_locations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_locations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id varchar REFERENCES project_locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_locations_project_idx ON project_locations (project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'defects_location_id_fkey') THEN
    ALTER TABLE defects ADD CONSTRAINT defects_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES project_locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── defect_watchers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS defect_watchers (
  defect_id varchar NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (defect_id, user_id)
);
CREATE INDEX IF NOT EXISTS defect_watchers_user_idx ON defect_watchers (user_id);

-- ── defect_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS defect_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  defect_id varchar NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS defect_events_defect_idx ON defect_events (defect_id, created_at);

-- ── backfills ──────────────────────────────────────────────────────────────
-- company_id from the project.
UPDATE defects d SET company_id = p.company_id
  FROM projects p
 WHERE d.project_id = p.id AND d.company_id IS NULL;

-- stage from the legacy status. Only rows still on the column default and
-- never touched by v2 (no number yet) — so a re-run can't undo a real stage.
UPDATE defects SET stage = CASE status
    WHEN 'in_progress' THEN 'sent'
    WHEN 'resolved'    THEN 'fixed'
    WHEN 'closed'      THEN 'closed'
    ELSE 'open'
  END
 WHERE number IS NULL AND stage = 'open';

-- closed_* for rows already closed: best available record is the resolved stamp.
UPDATE defects SET closed_at = COALESCE(date_resolved, updated_at),
                   closed_by = resolved_by,
                   closed_by_name = resolved_by_name
 WHERE stage = 'closed' AND closed_at IS NULL;

-- number per project in created_at order, continuing after any numbers already set.
WITH mx AS (
  SELECT project_id, COALESCE(MAX(number), 0) AS base FROM defects GROUP BY project_id
), ranked AS (
  SELECT d.id, mx.base + ROW_NUMBER() OVER (PARTITION BY d.project_id ORDER BY d.created_at, d.id) AS n
    FROM defects d JOIN mx ON mx.project_id = d.project_id
   WHERE d.number IS NULL
)
UPDATE defects d SET number = ranked.n FROM ranked WHERE ranked.id = d.id;

-- Creator watches their own defects.
INSERT INTO defect_watchers (defect_id, user_id)
SELECT d.id, d.created_by FROM defects d
  JOIN users u ON u.id = d.created_by
 WHERE d.created_by IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── indexes (after the backfill so the unique number index can build) ──────
CREATE INDEX IF NOT EXISTS defects_company_project_stage_idx ON defects (company_id, project_id, stage);
CREATE UNIQUE INDEX IF NOT EXISTS defects_project_number_unique ON defects (project_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS defects_project_client_request_unique ON defects (project_id, client_request_id);
