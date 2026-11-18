-- Channel emoji: Messages channels can carry an optional emoji shown next to
-- the channel name (sidebar list, channel header, unread lists, mobile web).
-- NULL means "no emoji" and the UI falls back to the existing # / lock icon.
--
-- Additive and idempotent. 0130 is insurance types; 0131 is reserved for a
-- parallel branch.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS emoji text;
