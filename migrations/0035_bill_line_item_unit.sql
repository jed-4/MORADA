-- Bill line items: persist the unit of measure.
-- The bill grid has always shown a "Unit" field, but there was no column behind
-- it — the value was reset to "" on every load. The field now uses the shared
-- UnitSelect (Field Settings `estimate_item.unit`) and needs somewhere to live.
-- Apply manually via psql (see prod DB ops runbook); safe + idempotent.
ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS unit text;
