-- Sent purchase orders can be edited (and re-sent) until a bill is matched to
-- them. These record that a sent PO was changed, so the page, the activity
-- feed and the supplier's copy can say "Amended".
--
-- Additive and idempotent.

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amended_at timestamp;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amendment_count integer NOT NULL DEFAULT 0;
