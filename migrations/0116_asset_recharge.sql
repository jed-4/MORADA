-- Asset register PR 5: charge vehicles and plant to jobs.
--
--   assets.day_rate_cents     what a day of use charges a job, ex GST
--   asset_bookings            the asset is on a job for a date range; wins
--                             over the driver's timesheets for those days
--   asset_register_settings   one row per company: the cost code every
--                             recharge lands on
--
-- Charges themselves are NOT stored: they are worked out from timesheets,
-- the assignment history and bookings (shared/assetRecharge.ts), so editing
-- a timesheet or a booking can never leave a stale charge behind.
--
-- Additive and idempotent. Numbered 0116 (0115 is the bill-linking PR this
-- one is stacked on).

ALTER TABLE assets ADD COLUMN IF NOT EXISTS day_rate_cents integer;

CREATE TABLE IF NOT EXISTS asset_bookings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id varchar NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_date text NOT NULL,
  to_date text NOT NULL,
  include_weekends boolean NOT NULL DEFAULT false,
  notes text,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_bookings_asset_idx ON asset_bookings (asset_id);
CREATE INDEX IF NOT EXISTS asset_bookings_project_idx ON asset_bookings (project_id);

CREATE TABLE IF NOT EXISTS asset_register_settings (
  company_id varchar PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  recharge_cost_code_id varchar REFERENCES cost_codes(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
