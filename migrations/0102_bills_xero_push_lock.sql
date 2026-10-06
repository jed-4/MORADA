-- Stop one Morada bill becoming two Xero bills.
--
-- Saving a bill fires TWO pushes: the server schedules an auto-push (2s
-- debounce) and the client then calls /api/xero/push-bill directly. Normally
-- the explicit push stores xero_invoice_id before the auto-push reads the bill,
-- so the second one updates. But the push makes several Xero round trips before
-- it creates anything (contact, tax rates, accounts), so when it runs slow the
-- auto-push still sees a null xero_invoice_id — and CREATES a second bill in
-- Xero. That is how BILL-1743 ended up in Xero twice, one second apart, with
-- two different account codes.
--
-- This column is the mutex. A push claims the bill with a conditional UPDATE
-- (claim only if free, or if an earlier claim is older than the stale timeout)
-- so two concurrent pushes can never both reach the create.
--
-- Additive and idempotent.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_push_in_flight_at timestamp;

-- Finding the claim is a single-row lookup by id, so no index is needed; this
-- one makes the "is anything stuck mid-push" check cheap.
CREATE INDEX IF NOT EXISTS bills_xero_push_in_flight_idx
  ON bills (xero_push_in_flight_at)
  WHERE xero_push_in_flight_at IS NOT NULL;
