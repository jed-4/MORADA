-- Cost / charge / markup for selections and the Product Library.
--   selection_options.unit_charge     what the client pays per unit, cents INC GST
--   products.default_unit_charge      the library's charge per unit, cents INC GST
--   products.default_markup_percent   markup on cost, percent
--   products.gst_inclusive            whether default_unit_cost includes GST
--                                     (existing rows are ex GST, hence false)
-- Additive and idempotent. Also self-healed at boot (ensureSelectionPricingColumns)
-- because a missing column makes every selections read fail.
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS unit_charge integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_unit_charge integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_markup_percent double precision;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_inclusive boolean NOT NULL DEFAULT false;
