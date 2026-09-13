-- One company colour, set in one place — plus an accent.
--
-- Proposals were printing #3B82F6 for everyone regardless of the Brand Colour
-- in Settings, and the cause was a column DEFAULT being mistaken for a choice.
-- company_settings.proposal_primary_color defaults to '#3B82F6' and is not
-- editable anywhere in Settings — only a "Save as company default" button
-- buried in a proposal's Layout panel ever wrote it — so for practically every
-- company it holds the default, and the resolution chain picked it ahead of
-- brand_color, which is the one the Settings page actually writes.
--
-- Three changes, all additive or widening:
--
--   1. brand_secondary_color: the accent, beside the existing Brand Colour.
--      NULLABLE WITH NO DEFAULT, deliberately. A default here would recreate
--      the exact bug this migration exists to fix — "unset" has to be
--      distinguishable from "chosen".
--
--   2. proposal_primary_color loses its default, so from now on unset is NULL.
--
--   3. Rows still holding the old default are set to NULL. They cannot be
--      told apart from a deliberate choice of that blue, and Jed's call was
--      that treating them as never-set is right: it is the stock default, so
--      almost nobody picked it on purpose, and anyone who did can pick it
--      again. Nothing else reads this column after this release.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS brand_secondary_color text;

ALTER TABLE company_settings
  ALTER COLUMN proposal_primary_color DROP DEFAULT;

UPDATE company_settings
   SET proposal_primary_color = NULL
 WHERE proposal_primary_color = '#3B82F6';
