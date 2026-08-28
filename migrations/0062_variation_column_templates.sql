-- Saved column presets for variation documents.
--
-- 0060 gave each variation its own column choice plus a company-wide default.
-- This adds named presets on top, so a builder can keep more than one — a
-- detailed set for a client who wants the breakdown, a lean one for a client
-- who wants a number — and apply either without re-ticking the list.
--
-- Shape (shared/variationDocumentColumns.ts is the authority):
--   [ { "id": "...", "name": "Detailed", "columns": { ...VariationDocumentColumns } } ]
--
-- A malformed row is dropped on read rather than rendered, so one bad entry
-- cannot break the picker.
--
-- Note 0061 is NOT free — feat/business-calendar has 0061_leave_entries.sql on
-- an unpushed local branch, which a remote-only sweep does not see. Hence 0062.
--
-- Safe to re-run; IF NOT EXISTS. Nullable column, no rewrite, no backfill.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS variation_column_templates jsonb;
