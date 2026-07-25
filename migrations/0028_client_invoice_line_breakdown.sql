-- Persisted per-line money snapshot of the whole client invoice (contract claims,
-- variations, allowances, labour, bills, selections, markup, custom lines).
-- Written on every invoice save; the Xero push materialises its line items from
-- this so the Xero total always equals what Morada displayed at save time.
-- Nullable: legacy invoices without a snapshot must be resaved before pushing.

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS line_breakdown jsonb;
