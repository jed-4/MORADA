-- Per-line Xero account overrides for client invoices.
--
-- Until now only CUSTOM lines could carry an account code (client_invoice_items
-- .xero_account_code). Every other line source — contract claims, variations,
-- allowances, labour, bills, selections, builder's margin — was pushed to Xero
-- with no AccountCode, so a progress-claim invoice depended entirely on the
-- company default (company_settings.client_invoice_default_xero_account) or a
-- Xero account literally named "Sales". With neither, the push 422s and there
-- was no way for the user to fix it from the invoice.
--
-- Shape: Record<lineKey, accountCode>, where lineKey is the stable per-line
-- identity built by lineAccountKey() on the client:
--   contract:<contractClaimRowId>  variation:<variationId>
--   allowance:<estimateItemId>     bill:<billId>
--   selection:<selectionOptionId>  labour   markup
-- Custom lines keep their own column and are NOT keyed here.
--
-- Absent key = fall back to the company default, exactly as before, so existing
-- invoices are unaffected.

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS line_account_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
