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

-- apply_global_markup: whether a variation's global markup applies to an
-- allowance adjustment line. New lines default to TRUE (an overrun carries the
-- builder's margin, a deduction credits it back); the user can untick it per
-- line. Cost lines ignore it.
--
-- Every allowance line that already exists was totalled WITHOUT markup, so
-- those are set FALSE — no saved or approved variation changes value. The
-- backfill runs only in the same step that creates the column, so re-running
-- this file never flips lines saved after it first ran.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variation_items' AND column_name = 'apply_global_markup'
  ) THEN
    ALTER TABLE "variation_items"
      ADD COLUMN "apply_global_markup" boolean NOT NULL DEFAULT true;
    UPDATE "variation_items" SET "apply_global_markup" = false
      WHERE "item_type" = 'allowance';
  END IF;
END $$;
