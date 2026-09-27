-- A draft invoice linked to a schedule item takes its dates from that item
-- (invoice date = the item's finish; due date keeps the invoice's terms) and
-- follows it as the schedule moves — until either:
--   * someone sets the invoice date by hand   → date_pinned = true (stays
--     linked; "Follow the schedule again" clears it), or
--   * the invoice is approved (it's in Xero from then) → locked by status;
--     no flag needed.
--
-- One boolean on an existing table. Needs 0096. Apply BEFORE deploying:
-- invoice reads select every column of client_invoices.

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS date_pinned boolean NOT NULL DEFAULT false;
