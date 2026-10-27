-- Asset register PR 6: rego/insurance renewals in the cashflow forecast.
--
-- One switch per company, OFF by default. When on, every due date that has a
-- "last paid" amount becomes a payment in the forecast on the date it falls
-- due, repeating by its term. Off by default because the expenses register
-- may already forecast the same money (a P&L-imported or hand-entered
-- "Vehicles" line), and turning it on silently would double it.
--
-- Additive and idempotent. Numbered 0117 (0116 is the recharge PR this one is
-- stacked on).

ALTER TABLE asset_register_settings
  ADD COLUMN IF NOT EXISTS include_in_cashflow boolean NOT NULL DEFAULT false;
