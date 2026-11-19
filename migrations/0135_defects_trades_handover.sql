-- Defects v2, stages 2 and 3 (docs/DEFECTS_V2.md).
--
-- Stage 2 — trades: one private link per trade per job, sent / viewed /
-- fixed-by-trade stamps on each defect, the daily digest and owner overdue
-- reminder bookkeeping.
-- Stage 3 — handover: a per-project "share handover list with client" switch,
-- client sign-offs of the handover list, and backcharges to trades.
--
-- Additive and idempotent: safe to run twice. Needs 0131 first.
-- Apply to PROD BEFORE deploying the code — the new routes read every column.

-- ── defect_trade_links ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS defect_trade_links (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  token varchar NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp,
  last_viewed_at timestamp,
  last_digest_at timestamp,
  last_emailed_at timestamp
);
-- One LIVE link per trade per job; revoked ones are kept for the record.
CREATE UNIQUE INDEX IF NOT EXISTS defect_trade_links_live_unique
  ON defect_trade_links (project_id, contact_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS defect_trade_links_company_project_idx
  ON defect_trade_links (company_id, project_id);

-- ── defects: trade stamps, overdue reminder, backcharge ────────────────────
ALTER TABLE defects ADD COLUMN IF NOT EXISTS sent_to_trade_at timestamp;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS trade_viewed_at timestamp;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS trade_marked_fixed_at timestamp;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS owner_overdue_reminded_at timestamp;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharge_cents integer;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharge_reason text;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharged_at timestamp;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharge_contact_id varchar REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharge_cost_code_id varchar REFERENCES cost_codes(id) ON DELETE SET NULL;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharged_by varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS backcharged_by_name text;

CREATE INDEX IF NOT EXISTS defects_trade_contact_idx ON defects (project_id, assigned_contact_id, stage);
CREATE INDEX IF NOT EXISTS defects_backcharge_idx ON defects (company_id, project_id) WHERE backcharge_cents IS NOT NULL;

-- ── projects: share the handover list with the client ──────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_handover_with_client boolean NOT NULL DEFAULT false;

-- ── defect_handover_signoffs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS defect_handover_signoffs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  signer_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  job_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  defect_count integer NOT NULL DEFAULT 0,
  open_count integer NOT NULL DEFAULT 0,
  -- The list as it stood when signed: [{id, ref, title, stage, closedAt}].
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip_address text,
  user_agent text,
  signed_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS defect_handover_signoffs_project_idx
  ON defect_handover_signoffs (project_id, signed_at);
