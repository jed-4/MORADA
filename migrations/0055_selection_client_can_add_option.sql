-- Per-selection switch: may the client add their own option?
--
-- Selections already carry client_can_change ("may they change their mind after
-- submitting") and client_can_see_price. Neither covers adding, and until now
-- there was no way for a client to contribute an option at all — clientAccess.ts
-- is deny-by-default and grants clients GET on selections plus approve.
--
-- Per selection rather than per role, because the answer genuinely differs line
-- by line: switch it on for "Kitchen splashback" and off for "Structural steel
-- finish". DEFAULT false, so nothing changes for any existing selection until
-- someone deliberately ticks it.
--
-- What a client adds through this is an IDEA, not a priced product: no cost, no
-- markup, no SKU. The team turns it into a real option at the desk. The route
-- that lets them do it, and the clientAccess allow rule it needs, land with the
-- mobile capture flow — this column is the setting that governs it.
--
-- Idempotent, safe to replay.

ALTER TABLE selections
  ADD COLUMN IF NOT EXISTS client_can_add_option boolean NOT NULL DEFAULT false;
