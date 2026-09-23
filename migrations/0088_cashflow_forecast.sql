-- Cashflow forecast — PR 1 of 7 (engine: shared/cashflow).
--
-- Four new tables, nothing existing is altered. Money is integer cents inc
-- GST; dates are 'YYYY-MM-DD' text, like projects.start_date, so no time zone
-- can move a payment to the day before.
--
-- NUMBERING: 0086 (HBCF exclusions) and 0087 (take-off, PR #195) are claimed
-- by open branches. Renumber at merge if either lands differently.

-- One row per company. Kept off company_settings on purpose: that table is
-- read with select * on a hot path, so a column missing on a lagging
-- database breaks every page.
CREATE TABLE IF NOT EXISTS cashflow_settings (
  company_id varchar PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  buffer_cents integer NOT NULL DEFAULT 5000000,
  client_pay_days integer NOT NULL DEFAULT 14,
  supplier_pay_days integer NOT NULL DEFAULT 30,
  default_margin_percent integer NOT NULL DEFAULT 20,
  default_period text NOT NULL DEFAULT 'month',
  fortnight_anchor text,
  bank_account_ids text[],
  manual_opening_balance_cents integer,
  gst_basis text NOT NULL DEFAULT 'cash',
  bas_frequency text NOT NULL DEFAULT 'quarterly',
  bas_via_agent boolean NOT NULL DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT now()
);

-- How each job shows on the forecast. No row = the defaults for its phase.
CREATE TABLE IF NOT EXISTS project_cashflow_settings (
  project_id varchar PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  included boolean,
  mode text NOT NULL DEFAULT 'even',
  win_percent integer,
  client_pay_days integer,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_cashflow_settings_company_idx ON project_cashflow_settings (company_id);

-- Manual-mode claim amounts, one per job per month.
CREATE TABLE IF NOT EXISTS project_cashflow_manual (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_cashflow_manual_project_month_unique ON project_cashflow_manual (project_id, month);

-- The business expenses register (cash, with dates). Separate from
-- overhead_items, which is accrual budgeting mirrored from Xero's chart of
-- accounts; overhead_item_id optionally links an expense to its account.
CREATE TABLE IF NOT EXISTS business_expenses (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  amount_cents integer NOT NULL DEFAULT 0,
  has_gst boolean NOT NULL DEFAULT true,
  frequency text NOT NULL DEFAULT 'monthly',
  next_date text NOT NULL,
  end_date text,
  source text NOT NULL DEFAULT 'manual',
  xero_contact_id text,
  overhead_item_id varchar REFERENCES overhead_items(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_expenses_company_idx ON business_expenses (company_id);
