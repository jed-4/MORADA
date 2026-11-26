-- 0143: link a variation allowance line back to the allowance it came from.
--
-- Until now an "allowance adjustment" line on a variation held only a
-- description and an amount, so nothing could tell that an allowance was
-- already on a variation: the same allowance could be imported twice onto one
-- variation, or onto several variations.
--
-- source_estimate_item_id is the allowance (a PC/PS estimate item). It is set
-- by the variation picker and is null for cost lines and for allowance lines
-- written before this migration (the app falls back to matching their
-- "<name> — allowance adjustment" description).
--
-- ON DELETE SET NULL: deleting the estimate line must not delete client-facing
-- variation history.
--
-- Additive and idempotent. Apply to prod, Replit-dev and ep-jolly-tooth BEFORE
-- deploying the code that reads it — the variation editor selects this column.

ALTER TABLE "variation_items"
  ADD COLUMN IF NOT EXISTS "source_estimate_item_id" varchar
  REFERENCES "estimate_items"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "variation_items_source_estimate_item_id_idx"
  ON "variation_items" ("source_estimate_item_id");
