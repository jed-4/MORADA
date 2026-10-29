-- Asset register PR 3: pre-start checks done on the phone.
--
-- One row per check: who, when, the odometer/hours, one answer per checklist
-- item (results jsonb), photos, and the defect workflow (open -> fixed). The
-- template key is stored so a later change to a checklist can't rewrite
-- history. `date` is the Sydney calendar day, for "already done today?".
--
-- Numbered 0114: main took 0112 and an open PR (Apple sign-in) holds 0113.
-- Additive and idempotent. Nothing existing is touched.

CREATE TABLE IF NOT EXISTS asset_prestarts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id varchar NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  checked_at timestamp NOT NULL,
  date text NOT NULL,
  template_key text NOT NULL,
  meter integer,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_defect boolean NOT NULL DEFAULT false,
  unsafe boolean NOT NULL DEFAULT false,
  defect_status text,
  defect_fixed_at timestamp,
  defect_fixed_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  defect_fix_notes text,
  notes text,
  signed_name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_prestarts_asset_checked_idx ON asset_prestarts (asset_id, checked_at);
CREATE INDEX IF NOT EXISTS asset_prestarts_company_defect_idx ON asset_prestarts (company_id, defect_status);
