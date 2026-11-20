-- Budget page, Forecast tab:
--  * project_cost_completions — a cost row (cost code id, or "uncategorised" /
--    "variations" / "cat:<id>") ticked Complete. A complete row is forecast at
--    what it actually cost (spent + committed) instead of max(budget, actual),
--    so an underspend on a finished code finally counts as a saving.
--  * project_forecast_reviews — "Mark reviewed": who looked at the forecast,
--    when, and the contract / forecast cost / margin at that moment, so the
--    tab can say "Reviewed 12 days ago · margin moved −$3,400 since".
--
-- Additive and idempotent. 0138 is site sign + selection controls.

CREATE TABLE IF NOT EXISTS project_cost_completions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  row_key text NOT NULL,
  completed_at timestamp NOT NULL DEFAULT now(),
  completed_by_id varchar REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS project_cost_completions_project_row_key
  ON project_cost_completions (project_id, row_key);

CREATE TABLE IF NOT EXISTS project_forecast_reviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewed_at timestamp NOT NULL DEFAULT now(),
  reviewed_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  contract_cents integer NOT NULL,
  forecast_cost_cents integer NOT NULL,
  forecast_margin_cents integer NOT NULL,
  note text
);
CREATE INDEX IF NOT EXISTS project_forecast_reviews_project_at
  ON project_forecast_reviews (project_id, reviewed_at DESC);
