-- An estimate line's quantity can be a formula over take-off measurements.
--
--   quantity_formula:  "{takeoff:9f3…} * 1.1"   quantity: 53.09
--
-- The formula is what the estimator wrote; `quantity` stays the evaluated
-- number and remains the only thing pricing, the proposal and the client ever
-- read. Null formula = a plain typed quantity, which is every line today.
--
-- References are stored by ID. A take-off item is renamed by double-clicking
-- it in the list, and a formula holding names would break on that keystroke.
--
-- estimate_item_takeoff_refs is the reverse index: which lines depend on which
-- measurement. It exists so that re-measuring on the plan can find the affected
-- lines in ONE indexed query instead of scanning every formula in the company,
-- and so the take-off list can say "used by 3 estimate lines" before you delete
-- something. It is derived data — rebuilt from the formula whenever a line is
-- saved — so it can be truncated and repopulated safely if it ever drifts.
--
-- ON DELETE CASCADE on both sides: deleting a line drops its refs, and deleting
-- a measurement drops them too. The formula text keeps the dead id, which is
-- what makes the cell show a broken reference and hold the line's last
-- quantity, rather than silently re-pricing it at zero.
--
-- ⚠️ Apply BEFORE deploying. estimate_items is read on the estimate, proposal
-- and invoice screens; code that selects quantity_formula will fail those reads
-- until it exists.
--
-- Additive and idempotent: safe to run twice.
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS quantity_formula TEXT;

CREATE TABLE IF NOT EXISTS estimate_item_takeoff_refs (
  estimate_item_id VARCHAR NOT NULL REFERENCES estimate_items(id) ON DELETE CASCADE,
  measurement_id   VARCHAR NOT NULL REFERENCES takeoff_measurements(id) ON DELETE CASCADE,
  PRIMARY KEY (estimate_item_id, measurement_id)
);

CREATE INDEX IF NOT EXISTS estimate_item_takeoff_refs_measurement_idx
  ON estimate_item_takeoff_refs (measurement_id);
