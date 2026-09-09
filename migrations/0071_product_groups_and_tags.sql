-- Product Library: real groups, and tags that double as sets.
--
-- Until now a product's filing was two free-text columns, `category` and
-- `subcategory`. Nothing enforced spelling, so "Tapware", "tapware" and
-- "Tap ware" were three different groups, neither could be renamed, and a
-- product could only ever be in one place.
--
-- Two separate ideas, kept separate:
--
--   GROUP   where a product LIVES.  One per product. A tree.
--   TAG     what a product BELONGS TO.  Many per product. Cross-cutting.
--
-- Colorbond Monument lives in "Colours" and is tagged `colorbond-standard`.
-- Trying to make one mechanism do both is what left two free-text columns doing
-- neither well.
--
-- Schema only. The backfill that turns existing category/subcategory text into
-- group rows is a separate re-runnable script
-- (scripts/backfill-product-groups.ts), so this can land and be reverted
-- independently of the data. `category` and `subcategory` are deliberately NOT
-- dropped — they stay for one release while everything moves onto groups.

CREATE TABLE IF NOT EXISTS product_groups (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Self-referencing and nullable: the existing two levels migrate straight
  -- across, and a third can be added later without another migration.
  parent_id   varchar REFERENCES product_groups(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  colour      text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_groups_company_idx ON product_groups (company_id);
CREATE INDEX IF NOT EXISTS product_groups_parent_idx  ON product_groups (parent_id);

-- Only SIBLINGS must differ: two branches may each hold a "Colours".
-- NULLS NOT DISTINCT so two top-level groups cannot share a name — without it
-- every root would have parent_id NULL and therefore never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS product_groups_sibling_name_unique
  ON product_groups (company_id, parent_id, name) NULLS NOT DISTINCT;

-- Real rows, not a JSON string array (the shape price_list_items.tags uses),
-- because a tag here doubles as a SET: "add every product tagged
-- colorbond-standard to this selection". A set one typo away from fragmenting is
-- not one you would build a client-facing selection from, and free-text tags
-- cannot be renamed. Modelled on task_tags.
CREATE TABLE IF NOT EXISTS product_tags (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  colour      text,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_tags_company_name_unique
  ON product_tags (company_id, name);

-- A junction table rather than an id array on the product, so "every product
-- tagged X" is an indexed lookup — which is what makes bulk-add from a tag cheap
-- rather than a scan of every product's JSON.
CREATE TABLE IF NOT EXISTS product_tag_assignments (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id     varchar NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_tag_assignments_unique
  ON product_tag_assignments (product_id, tag_id);
CREATE INDEX IF NOT EXISTS product_tag_assignments_tag_idx
  ON product_tag_assignments (tag_id);

-- ON DELETE SET NULL: deleting a group must never delete the products filed in
-- it. They fall back to "Unfiled".
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS group_id varchar REFERENCES product_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_group_id_idx ON products (group_id);

-- Distinguishes a real library product from a row the templateData
-- write-through had to mint. Only the latter is hidden from the library.
--
-- The earlier test for "is this a shadow" was
-- NOT EXISTS (SELECT 1 FROM selection_template_options WHERE product_id = ...),
-- which also hid every product a template merely REFERENCED — so adding the
-- Colorbond colours to "Gutter colour" emptied the Product Library.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'library';

-- Anything already linked when this runs came from the backfill, which only ever
-- created shadows. A user-linked product cannot exist yet: the picker did not
-- keep productId until the change that ships alongside this.
UPDATE products SET source = 'template_shadow'
WHERE source = 'library'
  AND EXISTS (SELECT 1 FROM selection_template_options WHERE product_id = products.id);

CREATE INDEX IF NOT EXISTS products_source_idx ON products (company_id, source);
