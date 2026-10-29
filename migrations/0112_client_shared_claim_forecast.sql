-- Sharing the payment schedule with the client.
--
-- A client wants to know what is coming: "Lock-up, 20%, $99,476, late July".
-- The claims that answer that are DRAFTS, and a draft is still being worked on
-- — its total moves as variations are approved and allowances reconcile. So the
-- client cannot be shown the live total, or every edit the builder makes looks
-- to them like the price changing.
--
-- These three columns are the frozen half: the amount the builder chose to put
-- in front of the client, when, and who did it. Editing the draft never touches
-- them. Nothing is shared until a builder says so — a null client_shared_at
-- means the claim does not appear in the client's schedule at all.
--
-- There is no "swap on approval" step: once the claim is SENT the existing
-- visibility rule (sent/partial/paid/overdue) takes over and the client sees the
-- real document. The stamp stays behind as the record of what they were told to
-- expect, which is the question that gets asked when the two differ.
--
-- Additive and idempotent. No backfill: every existing claim starts unshared,
-- which is the behaviour clients have today.

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS client_shared_amount_cents integer;

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS client_shared_at timestamp;

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS client_shared_by_id varchar;

-- The client's schedule reads "every shared claim on this project", so the
-- lookup is by project and sharedness.
CREATE INDEX IF NOT EXISTS client_invoices_shared_idx
  ON client_invoices (project_id, client_shared_at);
