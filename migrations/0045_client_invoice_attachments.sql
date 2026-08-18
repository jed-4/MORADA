-- Attachments on client invoices.
--
-- The invoice page has shown an "Attachments" section since it was built, but
-- there was nothing behind it: no column, no upload route, no storage. It only
-- ever rendered "No attachments", so the feature read as broken rather than
-- absent.
--
-- Mirrors variations.attachments: an array of
--   { name, url, size?, type?, includeInPdf?: boolean }
-- where `url` is the object-storage path returned by /api/uploads/request-url.
-- `includeInPdf` marks the few attachments that should be appended to the
-- rendered invoice; everything else is offered as a link.

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
