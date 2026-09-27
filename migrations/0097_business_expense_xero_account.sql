-- Business expenses built from the Xero P&L.
--
-- Each expense imported from the P&L remembers the Xero account it came from,
-- so the register can show how much of every overhead account it accounts for
-- (and add a "remainder" line for the gap). Manual expenses leave it null.
-- Separate from the Overheads module on purpose.
--
-- One nullable column + index on an existing table. Needs 0090. Apply BEFORE
-- deploying: the cashflow reads select every column of business_expenses.

ALTER TABLE business_expenses ADD COLUMN IF NOT EXISTS xero_account_code text;
CREATE INDEX IF NOT EXISTS business_expenses_xero_account_idx ON business_expenses (company_id, xero_account_code);
