-- Labour templates you can name, open and keep more than one of.
--
-- Details already worked this way: enote_template_sets holds named templates and
-- enote_templates rows are scoped to one by template_set_id. Labour had no
-- equivalent — labour_task_templates carried only a company and a category name,
-- so a company had exactly ONE labour template, edited in place, with no way to
-- keep a "Knockdown Rebuild" list separate from a "Bathroom Reno" one.
--
-- This adds the missing container so Labour can be a library like Details and
-- like Estimate Items.
--
-- DELIBERATELY NO BACKFILL. Existing rows keep template_set_id NULL, which stays
-- the unnamed working list the app has always applied by category name — so the
-- current "Apply to Project" button keeps behaving exactly as it does today.
-- Backfilling everything into a "Default" set would have emptied that path and
-- silently broken it. New named templates get a set id; the old list is offered
-- alongside them until it is empty.
--
-- Per project convention: apply BY HAND via psql — dev first, then prod. Never
-- db:push. As of writing this is applied to DEV ONLY, at Jed's instruction,
-- because prod already carries a queue of unapplied migrations that needs
-- resolving separately.

CREATE TABLE IF NOT EXISTS labour_template_sets (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labour_template_sets_company_idx
  ON labour_template_sets (company_id);

-- Nullable on purpose: NULL means "the unnamed working list", not "orphaned".
-- ON DELETE CASCADE so deleting a template takes its rows with it, rather than
-- leaving rows pointing at a set that no longer exists (which is what the
-- equivalent enote_templates column does today, since it has no FK at all).
ALTER TABLE labour_task_templates
  ADD COLUMN IF NOT EXISTS template_set_id VARCHAR
  REFERENCES labour_template_sets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS labour_task_templates_set_idx
  ON labour_task_templates (template_set_id);
