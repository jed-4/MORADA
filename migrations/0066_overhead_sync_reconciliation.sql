-- Reconciliation audit for the Xero → Monthly Actuals sync.
--
-- WHY: the sync writes overhead/income/direct-cost actuals one account-month at
-- a time and, for months that have been CONFIRMED, does not delete first. So a
-- run that dies partway leaves confirmed months frozen at whatever was last
-- written, with no drift flag (drift is only computed when a write happens) and
-- no visible signal anywhere in the UI. That is how ~$19.2k of Jul/Aug 2026
-- costs sat missing against Xero without anyone being told.
--
-- This table records, per month, what Xero's own P&L section totals said versus
-- what we actually stored, at the moment of each sync. Monthly Actuals reads it
-- to raise a banner naming the month and the dollar difference.
--
-- Standalone table on purpose: if this migration has not been applied yet the
-- reconciliation query fails alone and the banner degrades to absent. A column
-- bolted onto company_income_actuals would instead 500 every Overheads request
-- until applied.
--
-- Per project convention: apply BY HAND via psql — dev first, then prod. Never
-- db:push. NOT YET APPLIED ANYWHERE as of writing.

CREATE TABLE IF NOT EXISTS overhead_sync_reconciliation (
  id                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year                     integer NOT NULL,
  month                    integer NOT NULL,
  xero_income_cents        integer NOT NULL DEFAULT 0,
  xero_direct_cost_cents   integer NOT NULL DEFAULT 0,
  xero_expense_cents       integer NOT NULL DEFAULT 0,
  stored_income_cents      integer NOT NULL DEFAULT 0,
  stored_direct_cost_cents integer NOT NULL DEFAULT 0,
  stored_expense_cents     integer NOT NULL DEFAULT 0,
  checked_at               timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS overhead_sync_reconciliation_company_year_month_unique
  ON overhead_sync_reconciliation (company_id, year, month);
