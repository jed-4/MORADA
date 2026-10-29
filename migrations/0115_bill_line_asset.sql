-- Asset register PR 4: link a bill line to the vehicle/plant it was spent on.
--
-- Fuel statements, servicing, tyres, rego and insurance already arrive as
-- bills (mostly from Xero). Tagging the line with the asset gives each
-- vehicle a running cost with no new data entry.
--
-- One nullable column; nothing written. ON DELETE SET NULL so deleting an
-- asset never touches a bill. Numbered 0115: 0112/0113 are on main, 0114 is
-- the pre-start PR this one is stacked on.

ALTER TABLE bill_line_items
  ADD COLUMN IF NOT EXISTS asset_id varchar REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bill_line_items_asset_idx
  ON bill_line_items (asset_id) WHERE asset_id IS NOT NULL;
