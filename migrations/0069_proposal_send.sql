-- Proposals: send pipeline
--
-- Sending a proposal now persists the exact PDF the client was emailed, so the
-- portal can serve that same document back rather than re-deriving a lookalike
-- from live data. `sent_to` records who it went to at send time — the contact
-- may be edited or removed later, and the proposal should still say who
-- received it.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS sent_pdf_path text,
  ADD COLUMN IF NOT EXISTS sent_to jsonb DEFAULT '[]'::jsonb;
