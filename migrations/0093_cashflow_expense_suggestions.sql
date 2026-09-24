-- Cashflow forecast — PR 6 of 7: business expenses suggested from Xero.
--
-- Morada reads a year of Xero spend, finds suppliers paid on a regular
-- pattern, and suggests them for the business expenses register. One row per
-- supplier; the builder's decision (added / job cost / ignore) sticks across
-- re-scans — only pending rows are refreshed.
--
-- One new table; nothing existing is altered. Needs 0090 (business_expenses).

CREATE TABLE IF NOT EXISTS expense_suggestions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_key text NOT NULL,
  xero_contact_id text,
  contact_name text NOT NULL,
  name text NOT NULL,
  category text,
  ai_kind text,
  amount_cents integer NOT NULL,
  has_gst boolean NOT NULL DEFAULT true,
  frequency text NOT NULL,
  next_date text NOT NULL,
  confidence text NOT NULL,
  lapsed boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  evidence jsonb,
  status text NOT NULL DEFAULT 'pending',
  business_expense_id varchar REFERENCES business_expenses(id) ON DELETE SET NULL,
  scanned_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS expense_suggestions_company_contact_unique ON expense_suggestions (company_id, contact_key);
