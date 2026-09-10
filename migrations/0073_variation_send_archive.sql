-- Variations: keep the document the client signed.
--
-- Sending a variation renders the PDF in the browser and posts it to the
-- server, which attaches it to the email and then throws the buffer away. The
-- portal renders LIVE data, so between sending and signing the document can
-- change underneath the client — and after signing there is nothing fixed to
-- point at. A signature against a mutable document is weak evidence.
--
-- One row per send rather than columns on `variations`. Proposals put its
-- snapshot and PDF path straight on the row (0069), which loses the first send
-- the moment you send twice. For something a client signs that history IS the
-- record: send v1, revise, send v2, they sign v2 — the signature has to name
-- which one, and v1 must remain provable.
CREATE TABLE IF NOT EXISTS variation_sends (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id      varchar NOT NULL REFERENCES variations(id) ON DELETE CASCADE,
  company_id        varchar NOT NULL,

  sent_at           timestamp NOT NULL DEFAULT now(),
  sent_by_id        varchar REFERENCES users(id) ON DELETE SET NULL,

  -- Frozen at send time: the contact may be edited or deleted later, and the
  -- variation should still be able to say who received it. Also the only
  -- record of the message itself — sendGenericEmail persists nothing.
  sent_to           jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject           text,
  body              text,

  -- The document as it went out.
  content_snapshot  jsonb,
  sent_pdf_path     text,

  -- Per-send engagement. variations.portal_viewed_at is FIRST open only and
  -- cannot distinguish one send from the next.
  first_viewed_at   timestamp,
  last_viewed_at    timestamp,
  view_count        integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS variation_sends_variation_idx
  ON variation_sends (variation_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS variation_sends_company_idx
  ON variation_sends (company_id);

-- Which send the signature belongs to. Null for anything signed before this,
-- and for variations that were never sent through the portal.
ALTER TABLE variations
  ADD COLUMN IF NOT EXISTS signed_send_id varchar REFERENCES variation_sends(id);
