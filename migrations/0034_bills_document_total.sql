-- Bills: anchor the supplier invoice's printed total (cents inc GST).
-- When set, the client re-derives rounding_cents from it on every lines/taxMode
-- change so the bill total tracks the document instead of drifting.
-- Numbered 0034 to stay clear of 0029/0030 (variations), 0031 (dashboard
-- widgets), and 0032/0033 (signup/onboarding) on unmerged branches.
-- Apply manually via psql (see prod DB ops runbook); safe + idempotent.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS document_total_cents integer;
