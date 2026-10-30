-- Asset register: vehicles first, then trailers, plant and tools.
--
-- Five new tables, nothing existing is touched:
--   assets                  - the register itself (rego, VIN, GVM, driver, meter)
--   asset_compliance_items  - one row per expiring thing: rego, CTP/green slip,
--                             insurance, pink slip, finance end, test & tag
--   asset_service_schedules - "every 10,000 km or 6 months, whichever first"
--   asset_events            - history: services, repairs, meter readings, notes,
--                             plus assignment and status changes
--   asset_documents         - rego papers, certificates, manuals, photos
--
-- Every child table carries company_id as well as asset_id so a query can be
-- company-scoped on its own row. Dates are 'YYYY-MM-DD' text, like the
-- cashflow registers, so a due date can't slide a day between time zones.
-- Money is integer cents inc GST.
--
-- Additive and idempotent. Safe to run before the code that reads it ships.

CREATE TABLE IF NOT EXISTS assets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_type text NOT NULL DEFAULT 'vehicle',
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  make text,
  model text,
  year integer,
  vin text,
  rego text,
  rego_state text,
  gvm_kg integer,
  colour text,
  photo_url text,
  assigned_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  purchase_date text,
  purchase_cents integer,
  finance_provider text,
  meter_type text NOT NULL DEFAULT 'km',
  current_meter integer,
  current_meter_date text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_company_idx ON assets (company_id);
CREATE INDEX IF NOT EXISTS assets_company_rego_idx ON assets (company_id, rego);

CREATE TABLE IF NOT EXISTS asset_compliance_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id varchar NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text,
  provider text,
  policy_number text,
  expiry_date text NOT NULL,
  term_months integer,
  amount_cents integer,
  document_url text,
  notes text,
  reminder_30_sent boolean NOT NULL DEFAULT false,
  reminder_7_sent boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_compliance_items_asset_idx ON asset_compliance_items (asset_id);
CREATE INDEX IF NOT EXISTS asset_compliance_items_company_expiry_idx ON asset_compliance_items (company_id, expiry_date);

CREATE TABLE IF NOT EXISTS asset_service_schedules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id varchar NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  label text NOT NULL,
  every_meter integer,
  every_months integer,
  last_done_meter integer,
  last_done_date text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_service_schedules_asset_idx ON asset_service_schedules (asset_id);

CREATE TABLE IF NOT EXISTS asset_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id varchar NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind text NOT NULL,
  date text NOT NULL,
  title text,
  notes text,
  meter integer,
  cost_cents integer,
  schedule_id varchar REFERENCES asset_service_schedules(id) ON DELETE SET NULL,
  related_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_events_asset_date_idx ON asset_events (asset_id, date);

CREATE TABLE IF NOT EXISTS asset_documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id varchar NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  uploaded_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_documents_asset_idx ON asset_documents (asset_id);
