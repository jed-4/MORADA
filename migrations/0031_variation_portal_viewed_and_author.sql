-- Two additions to variations:
--   portal_viewed_at — set the first time a client opens the portal link, so
--   "seen" reflects the client actually viewing it rather than a builder
--   ticking a box (is_seen was only ever a manual toggle despite its comment).
--   created_by_id — who raised the variation. The pending-variations widget
--   showed "submitted by" derived from approved_by, which is null on every
--   unapproved variation, so the column always rendered "—".
ALTER TABLE variations ADD COLUMN IF NOT EXISTS
  portal_viewed_at timestamp;
ALTER TABLE variations ADD COLUMN IF NOT EXISTS
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL;
