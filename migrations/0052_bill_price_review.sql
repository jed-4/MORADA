-- Bill-centric price review.
--
-- Two things the review needs that nothing records today:
--
-- 1. Whether a bill has been price-reviewed. bills.ocr_processed only says the
--    document was read at import, which is a different question and does not
--    stop you reviewing the same bill twice.
--
-- 2. Somewhere to keep product codes read out of a bill's PDF. Jed's call was
--    that SKUs must not appear on bill_line_items -- they would be noise on a
--    bill -- so they live here instead, invisible to the bills UI, and exist
--    purely so a re-read costs tokens once rather than every review.
--
-- Idempotent and purely additive: safe to run twice, drops nothing.

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS price_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS price_reviewed_by varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_price_reviewed_by_fk'
  ) THEN
    ALTER TABLE bills
      ADD CONSTRAINT bills_price_reviewed_by_fk
      FOREIGN KEY (price_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bills_price_reviewed_idx
  ON bills (company_id, price_reviewed_at);

-- Codes read out of the supplier's document, one row per bill line we found a
-- code for. company_id is carried so the cache can be scoped without joining
-- back through bills on every read.
CREATE TABLE IF NOT EXISTS bill_line_item_skus (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bill_line_item_id varchar NOT NULL REFERENCES bill_line_items(id) ON DELETE CASCADE,
  sku text NOT NULL,
  -- Where it came from, so a bad extraction run can be identified and cleared.
  source text NOT NULL DEFAULT 'pdf',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bill_line_item_skus_line_unique
  ON bill_line_item_skus (bill_line_item_id);

CREATE INDEX IF NOT EXISTS bill_line_item_skus_company_idx
  ON bill_line_item_skus (company_id);

CREATE INDEX IF NOT EXISTS bill_line_item_skus_sku_idx
  ON bill_line_item_skus (company_id, sku);
