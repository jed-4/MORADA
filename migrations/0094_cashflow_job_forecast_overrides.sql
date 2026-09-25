-- Cashflow forecast: set up a job that isn't contracted yet.
--
-- A lead or pre-construction job often has no contract price, client budget,
-- schedule or proposed dates, so the forecast showed it as $0 with no dates
-- and there was nowhere to fix that. These are the builder's own forecast
-- figures for the job:
--   forecast_value_cents  what the job is expected to be worth, inc GST.
--                         Used ONLY while the job has no contract — a signed
--                         contract always wins.
--   forecast_start/end    'YYYY-MM-DD'. Win over the schedule and the
--                         project's proposed dates when set.
--
-- Three nullable columns on an existing table; nothing else changes. Needs 0090.
-- Apply BEFORE deploying: the cashflow reads select every column of this table.

ALTER TABLE project_cashflow_settings ADD COLUMN IF NOT EXISTS forecast_value_cents integer;
ALTER TABLE project_cashflow_settings ADD COLUMN IF NOT EXISTS forecast_start text;
ALTER TABLE project_cashflow_settings ADD COLUMN IF NOT EXISTS forecast_end text;
