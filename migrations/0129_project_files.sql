-- Project files: uploaded into Morada, grouped by folder ("Plans"), and
-- optionally shown on the project's site QR page (on_site, OFF by default —
-- anyone holding the printed code can open an on-site file).
--
-- Additive and idempotent. 0128 is library properties (PR #407).

CREATE TABLE IF NOT EXISTS project_files (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder text NOT NULL DEFAULT 'Plans',
  name text NOT NULL,
  object_path text NOT NULL,
  mime_type text,
  file_size integer,
  on_site boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_files_project_idx ON project_files (project_id);
