-- Operational task templates can name more than one user.
--
-- The generator already fans a ROLE out to every user who holds it, creating
-- one task each. The "user" branch could only name one person, so a template
-- that should land on two people had to be duplicated.
--
-- Additive and idempotent: one nullable array column with a default, no rows
-- written. The legacy assignee_user_id stays exactly as it is and is still
-- read as a one-element fallback when this array is empty, so nothing needs
-- backfilling and an older client keeps working.
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS assignee_user_ids text[] DEFAULT '{}';
