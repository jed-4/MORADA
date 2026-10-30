-- Operations Library (Phase 2 of OPERATIONS_PLAN.md).
--
-- `docs` becomes the company's one document library: SOPs, policies,
-- templates, checklists, references. Each doc gets a type, a sign-off status
-- and a version history; doc_versions keeps the exact text of every approval,
-- so editing an approved doc (which drops it back to draft) never loses what
-- was signed off.
--
-- The old Operations "Folders" tab (system_folders / system_documents) is
-- folded in: its rows are COPIED into doc_folders / docs, keeping their ids.
-- The old tables are left in place and untouched, so this can be re-run and
-- nothing is destroyed. system_documents only ever held a pasted URL, so it
-- arrives as a link entry; its description becomes the body.
--
-- NOT carried over: system_folders.role_ids / is_public (per-folder role
-- restriction). Count restricted folders on the target DB before applying:
--   SELECT count(*) FROM system_folders
--   WHERE is_public = false OR coalesce(json_array_length(role_ids), 0) > 0;
--
-- Additive and idempotent.

ALTER TABLE docs ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'document';
ALTER TABLE docs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE docs ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 0;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS submitted_at timestamp;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS submitted_by_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS approved_by_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS approved_by_name text;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS docs_company_idx ON docs (company_id);
CREATE INDEX IF NOT EXISTS doc_folders_company_idx ON doc_folders (company_id);

CREATE TABLE IF NOT EXISTS doc_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL,
  doc_id varchar NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  content_html text NOT NULL DEFAULT '',
  approved_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  approved_by_name text,
  approved_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS doc_versions_doc_version_uq ON doc_versions (doc_id, version);

-- Fold the old Folders tab in. doc_folders.parent_folder_id carries no
-- foreign key, so parents and children copy in one statement in any order.
INSERT INTO doc_folders (id, company_id, name, parent_folder_id, sort_order)
SELECT sf.id, sf.company_id, sf.name, sf.parent_id, coalesce(sf.display_order, 0)
FROM system_folders sf
WHERE NOT EXISTS (SELECT 1 FROM doc_folders df WHERE df.id = sf.id);

INSERT INTO docs (
  id, company_id, folder_id, title, content_html, content_text,
  owner_id, owner_name, doc_type, status, tags, link_url, created_at, updated_at
)
SELECT
  sd.id, sd.company_id,
  CASE WHEN EXISTS (SELECT 1 FROM doc_folders df WHERE df.id = sd.folder_id) THEN sd.folder_id END,
  sd.title,
  CASE WHEN coalesce(sd.description, '') = '' THEN ''
       -- HTML-escaped; chr(59) is ';', spelled out so the statement splitter
       -- in scripts/apply-sql-migration.ts doesn't cut the entities in half.
       ELSE '<p>' || replace(replace(replace(sd.description,
              '&', '&amp' || chr(59)), '<', '&lt' || chr(59)), '>', '&gt' || chr(59)) || '</p>' END,
  coalesce(sd.description, ''),
  sd.created_by, sd.created_by_name,
  CASE sd.type
    WHEN 'procedure' THEN 'sop'
    WHEN 'policy' THEN 'policy'
    WHEN 'template' THEN 'template'
    WHEN 'reference' THEN 'reference'
    ELSE 'document'
  END,
  'draft',
  CASE WHEN json_typeof(sd.tags) = 'array' THEN sd.tags::jsonb ELSE '[]'::jsonb END,
  sd.file_url,
  sd.created_at, sd.updated_at
FROM system_documents sd
WHERE NOT EXISTS (SELECT 1 FROM docs d WHERE d.id = sd.id);
