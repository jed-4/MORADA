-- The order of groups in the Details and Labour template libraries.
--
-- Both lists sorted their groups alphabetically, and nothing stored any other
-- order: each template row has a sort_order, but it orders rows WITHIN a group
-- (and Details and Labour even fill it differently), so a group order can't be
-- packed into it. Jed wants the order to be whatever he drags it into, the same
-- for the whole company.
--
-- One row per company holding the group names in order. Names rather than ids
-- because a group has no identity of its own here — it IS its name, on the
-- enote_templates and labour_task_templates rows. A name missing from the list
-- (a group created since the last drag) sorts to the bottom; a name no longer in
-- use is simply ignored, so renames and deletes never need to touch this row.
--
-- A NEW table, deliberately, not a column on company_settings. That table is
-- read on almost every page, so a column added to the schema before this
-- migration ran would fail every one of those reads. This table is read only by
-- the template group order routes, which fall back to alphabetical if it is not
-- there yet.
--
-- Additive and idempotent: safe to run twice, and nothing existing changes.
CREATE TABLE IF NOT EXISTS template_group_orders (
  company_id  VARCHAR PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  group_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
