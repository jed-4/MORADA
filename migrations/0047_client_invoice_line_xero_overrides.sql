-- Generalise the per-line Xero override from "just the account code" to the
-- full set of things a line needs to post correctly: account, GST treatment,
-- and tracking options.
--
-- 0046 stored Record<lineKey, accountCode>. This rewrites it to
--   Record<lineKey, { account?: string, taxable?: boolean,
--                     tracking?: Record<trackingCategoryId, trackingOptionId> }>
-- and renames the column to match. Absent keys still mean "use the company
-- default account, charge GST, and inherit the project's tracking option", so
-- existing invoices are unaffected.
--
-- 0046 has not reached Replit-dev or prod, so on those this is simply an ADD.
-- On any database where 0046 did land (Jed's local dev), the rename and the
-- value rewrite below carry the saved account codes across.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_invoices' AND column_name = 'line_account_overrides'
  ) THEN
    -- string value -> { "account": <string> }
    UPDATE client_invoices
    SET line_account_overrides = (
      SELECT COALESCE(jsonb_object_agg(key, jsonb_build_object('account', value)), '{}'::jsonb)
      FROM jsonb_each_text(line_account_overrides)
    )
    WHERE line_account_overrides IS NOT NULL
      AND line_account_overrides <> '{}'::jsonb;

    ALTER TABLE client_invoices RENAME COLUMN line_account_overrides TO line_xero_overrides;
  ELSE
    ALTER TABLE client_invoices
      ADD COLUMN IF NOT EXISTS line_xero_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
