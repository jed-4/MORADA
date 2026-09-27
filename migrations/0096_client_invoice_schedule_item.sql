-- Link a client invoice (progress claim) to the schedule item that triggers it.
--
-- The claim is raised when that item finishes: the schedule shows the invoice
-- on the item (to people with "Progress Claims"), and the cashflow forecasts a
-- linked DRAFT invoice at the item's finish + client pay days, so it moves when
-- the schedule moves. One item can trigger more than one invoice.
--
-- One nullable column + index on an existing table. Deleting the schedule item
-- just unlinks the invoice. Apply BEFORE deploying: invoice reads select every
-- column of client_invoices.

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS schedule_item_id varchar REFERENCES schedule_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS client_invoices_schedule_item_idx ON client_invoices (schedule_item_id);
