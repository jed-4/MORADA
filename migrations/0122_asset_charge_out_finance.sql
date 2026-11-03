-- Asset register: charge-out toggle and finance repayments.
--
--   assets.charge_out                 true = this asset is charged to jobs
--                                     (an excavator, a tipper). A ute that is
--                                     "just used" stays false and is never
--                                     charged, whatever its day rate.
--   assets.finance_repayment_cents    one repayment, as paid
--   assets.finance_frequency          weekly | fortnightly | monthly
--   assets.finance_start_date         first repayment, 'YYYY-MM-DD'
--   assets.finance_end_date           last repayment, 'YYYY-MM-DD' (blank = open)
--
-- Backfill: an asset that already had a day rate WAS being charged out, so it
-- keeps charging. Additive and idempotent.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS charge_out boolean NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS finance_repayment_cents integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS finance_frequency text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS finance_start_date text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS finance_end_date text;

UPDATE assets SET charge_out = true WHERE day_rate_cents > 0 AND charge_out = false;
