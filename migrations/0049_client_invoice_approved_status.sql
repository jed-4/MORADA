-- Backfill invoices that are AUTHORISED in Xero but still read "draft" here.
--
-- The push route sent Status: "AUTHORISED" to Xero but wrote back only the
-- Xero ids, never the local status — so an invoice could be a live receivable
-- in Xero and a draft in Morada. Every contract-price guard is written as
-- `status != 'draft'`, so those invoices also never had their contract price
-- locked and kept recalculating against the live estimate.
--
-- Any invoice already pushed to Xero has, by definition, been authorised there.
UPDATE client_invoices
SET status = 'approved', updated_at = now()
WHERE status = 'draft'
  AND xero_invoice_id IS NOT NULL;

-- NOTE: locked_contract_price is deliberately NOT backfilled. It is meant to
-- record the contract price at the moment of approval, and that moment has
-- passed — stamping today's price would invent a figure that was never true.
-- These invoices keep reading the live price until they are re-approved or
-- edited; the drift banner will now at least be visible for them, because it
-- is gated on status != 'draft'.
