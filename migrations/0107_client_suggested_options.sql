-- Clients can suggest an option on a selection when the builder has switched
-- on "Allow Client Suggestions" (selections.client_can_add_option, 0055).
--   client_suggested  marks the option as the client's, so the builder sees it
--   suggested_by      the name the client gave (portal) or their account name
-- Additive and idempotent; also ensured at boot (ensureSelectionPricingColumns).
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS client_suggested boolean NOT NULL DEFAULT false;
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS suggested_by text;
