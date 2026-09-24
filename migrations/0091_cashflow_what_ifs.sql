-- Cashflow forecast — PR 3 of 7: what-ifs.
--
-- A what-if is a template (employee, vehicle, win a job, one-off, custom) plus
-- its inputs in `params`. The template's payments are worked out when the
-- forecast runs (shared/cashflow/whatifs.ts), never stored, so a rate change
-- reaches every scenario. Only lines the user adds by hand are stored.
--
-- Two new tables; nothing existing is altered. Needs 0090 first.

CREATE TABLE IF NOT EXISTS what_ifs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  template text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS what_ifs_company_idx ON what_ifs (company_id);

CREATE TABLE IF NOT EXISTS what_if_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  what_if_id varchar NOT NULL REFERENCES what_ifs(id) ON DELETE CASCADE,
  name text NOT NULL,
  direction text NOT NULL DEFAULT 'out',
  amount_cents integer NOT NULL DEFAULT 0,
  has_gst boolean NOT NULL DEFAULT true,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date text NOT NULL,
  end_date text,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS what_if_lines_what_if_idx ON what_if_lines (what_if_id);
