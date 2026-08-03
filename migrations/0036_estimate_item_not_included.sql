-- Allowance "not included": mark a PC/PS allowance as excluded so it prices at
-- $0 without destroying the original amount.
--
-- Why a flag rather than zeroing the line:
--   1. A contracted allowance sits on a LOCKED estimate — its price cannot be
--      edited at all (updateEstimateItem throws), which is why there was no way
--      to make an allowance $0 in production.
--   2. The original amount is what a deduction variation has to credit back to
--      the client. Overwriting unitCostExTax / priceIncTax would destroy it.
--   3. It is reversible — clearing the flag restores the original price exactly.
--
-- shared/pricing.ts treats a not-included line as $0 everywhere (line total,
-- estimate summary, builder cost), so the estimate total drops by the allowance
-- amount. No variation is raised automatically.
--
-- The cached price_inc_tax / tax_amount are ALSO zeroed when the flag is set, so
-- the many read paths that use the cache directly show $0 without each needing
-- to learn about the flag. For a flat allowance (unit_cost_ex_tax = 0) that
-- cache is the only record of the amount, so it is copied into
-- not_included_original_price_inc_tax first and restored on un-exclude.

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS not_included BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS not_included_at TIMESTAMP;

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS not_included_original_price_inc_tax DOUBLE PRECISION;

-- Only allowances are ever excluded this way; a partial index keeps the lookup
-- cheap on estimates with thousands of ordinary lines.
CREATE INDEX IF NOT EXISTS estimate_items_not_included_idx
  ON estimate_items (estimate_id)
  WHERE not_included = TRUE;
