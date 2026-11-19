-- Project floor area (m²), for the price-per-m² and cost-per-m² metrics.
-- The project metrics already computed both from a `projectArea` the table
-- never had, so they could never show.
--
-- Additive and idempotent. 0131–0136 are taken by open PRs (defects v2,
-- site location, deliveries, defects trades, site visits); 0132 is channel emoji.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_area double precision;
