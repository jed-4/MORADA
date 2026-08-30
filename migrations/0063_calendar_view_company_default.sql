-- The business calendar's default view was created per USER, not per company.
--
-- BusinessCalendar auto-created an "All Events" row the first time each person
-- opened the page, so a company of fifteen ended up with fifteen private copies
-- of the same thing. Renaming or refiltering yours changed nothing for anyone
-- else, which is a strange property for the shared calendar.
--
-- This adds a company-level default, and collapses the existing per-user rows
-- into one per company.
--
-- Renumbered from 0062: main merged 0062_variation_column_templates (#99) while
-- this branch was in flight, and two migrations sharing a number is how the wrong
-- one gets applied. Already applied to dev under the old name — the column is the
-- same, so there is nothing to re-run there.
--
-- Per project convention: apply BY HAND via psql — dev first, then prod. Never
-- db:push.

ALTER TABLE calendar_views
  ADD COLUMN IF NOT EXISTS is_company_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Promote the oldest per-user default in each company to be the company default.
-- Oldest rather than newest: it is the one most likely to have been curated, and
-- the others are copies that were created simply by someone opening the page.
WITH ranked AS (
  SELECT id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM calendar_views
  WHERE calendar_type = 'business'
    AND is_default = TRUE
    AND is_archived = FALSE
)
UPDATE calendar_views cv
SET is_company_default = TRUE
FROM ranked r
WHERE cv.id = r.id AND r.rn = 1;

-- Archive the duplicates rather than deleting them: they are cheap, and someone
-- may have quietly customised their copy. They stop appearing in the tab strip.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM calendar_views
  WHERE calendar_type = 'business'
    AND is_default = TRUE
    AND is_archived = FALSE
)
UPDATE calendar_views cv
SET is_archived = TRUE, is_default = FALSE
FROM ranked r
WHERE cv.id = r.id AND r.rn > 1;

-- One company default per company. Partial, so ordinary views are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_views_one_company_default
  ON calendar_views (company_id)
  WHERE is_company_default AND NOT is_archived;

CREATE INDEX IF NOT EXISTS calendar_views_company_type_idx
  ON calendar_views (company_id, calendar_type)
  WHERE NOT is_archived;
