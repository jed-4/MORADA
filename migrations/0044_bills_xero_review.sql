-- Bills: persist the nightly Xero reconcile's "surprises" so they survive the
-- sweep. Before this, reconcileBillsWithXero built its surprise list purely in
-- memory — the notification's truncated message ("+N more") was the only record
-- of which bills needed review, so /bills could not show them.
--
-- xero_review_reason IS NOT NULL  = in the review queue.
-- xero_review_fingerprint vs _ack_fingerprint suppresses the nightly re-notify:
-- once dismissed, a bill stays quiet until Xero's state actually changes again.
-- xero_voided_at is deliberately NOT part of the review lifecycle — a void stays
-- visible on the bill after the queue entry is resolved.
--
-- Numbered 0044 to stay clear of 0036 (allowances), the two 0037s (field
-- settings / checklist), and 0042/0043 on main.
-- Apply manually via psql (see prod DB ops runbook); safe + idempotent.

ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_reason text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_changes jsonb;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_fingerprint text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_detected_at timestamp;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_ack_fingerprint text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_resolved_at timestamp;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_review_resolved_by varchar;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS xero_voided_at timestamp;

-- The review queue is a small slice of a large table; partial so the many
-- unflagged bills cost nothing.
CREATE INDEX IF NOT EXISTS bills_xero_review_open_idx
  ON bills (company_id, xero_review_detected_at DESC)
  WHERE xero_review_reason IS NOT NULL;
