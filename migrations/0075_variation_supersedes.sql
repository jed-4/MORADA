-- "Duplicate for revision": the link from a revision back to what it replaces.
--
-- A rejected variation is a dead end today. The only way to re-price the work
-- is to build a new variation by hand, and nothing connects the two — so the
-- record of what was asked for, refused, and re-offered lives in someone's
-- memory. That is exactly the trail that matters if a client later disputes
-- what they agreed to.
--
-- One nullable self-reference, not a `revisions` table: a variation has at
-- most one predecessor, and a chain (VAR-003 → VAR-004 → VAR-005) walks
-- naturally from it.
--
-- ON DELETE SET NULL, deliberately. The signed_send_id FK is NO ACTION because
-- an archived send is evidence and must not vanish from under a signature;
-- this is the opposite case. Deleting a superseded draft is an ordinary thing
-- to do, and it must not be blocked by the pointer its successor holds.
ALTER TABLE variations
  ADD COLUMN IF NOT EXISTS supersedes_variation_id varchar
  REFERENCES variations(id) ON DELETE SET NULL;

-- "What replaced this one?" — the reverse lookup, used on the rejected
-- original to point forward at its revision.
CREATE INDEX IF NOT EXISTS variations_supersedes_idx
  ON variations (supersedes_variation_id)
  WHERE supersedes_variation_id IS NOT NULL;
