-- Product Library, step 1 of 3 (migration 0068): give an option somewhere real to live.
--
-- The hierarchy Morada already has is
--
--   selection_template_groups   Category   "Roofing"
--   └── selection_templates     Selection  "Gutter profile"
--       └── templateData        Option     "Quad", "Half round"   <- a JSON BLOB
--
-- The blob is the problem. Because options are not rows you cannot search across
-- them, an option on a job cannot point back at the library option it came from,
-- and "save this to the library" has nowhere to put anything.
--
-- This migration adds the missing Option level. It moves no data: the backfill
-- that copies templateData into rows is a separate, re-runnable script
-- (scripts/backfill-product-library.ts), so the schema can land and be reverted
-- independently of the data.
--
-- templateData stays authoritative. These rows shadow it. Nothing reads them yet.
--
-- ── Why a link table and not columns on `products` ───────────────────────────
--
-- An earlier draft hung `selection_template_id` and `template_option_id`
-- straight off `products`. That works only while every option owns a private
-- product row, and it breaks the moment two templates specify the same thing —
-- which is the entire point of a library.
--
-- The fields divide cleanly:
--
--   PRODUCT (the spec)     name, brand, sku, description, category, unit type,
--                          url, default cost, specifications, images
--                          — a Colorbond quad gutter is the same object
--                            wherever it is specified
--
--   THIS TABLE (the use)   quantity, markup, total, client visibility, GST
--                          treatment, sort order
--                          — the same tapware can be 2 units and visible in one
--                            selection, 6 units and hidden in another
--
-- Doing this now rather than later is deliberate: both tables are empty, so it
-- is a schema change with no data migration. After go-live it would be a
-- backfill. Same reasoning as PRICE_LIST_STRUCTURE.md.

CREATE TABLE IF NOT EXISTS selection_template_options (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         varchar NOT NULL REFERENCES selection_templates(id) ON DELETE CASCADE,
  product_id          integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Denormalised from selection_templates so reads scope by tenant without a
  -- join, matching the rest of the schema.
  company_id          varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- How THIS template uses the product. Names and defaults mirror
  -- selection_options, because /apply copies them straight across.
  quantity            integer,
  unit_cost_override  integer,          -- cents; NULL = use products.default_unit_cost
  markup_percent      double precision,
  total_cost          integer,          -- cents
  visible_to_client   boolean,
  gst_inclusive       boolean,
  -- The option's OWN category, NULL when the blob did not give it one. The
  -- product's category may have been inherited from the item or template so the
  -- library can file it; that inheritance must not leak back into an applied
  -- selection option, which previously had no category at all.
  option_category     text,
  -- NULLABLE on purpose: /apply defaults an absent sortOrder to 0 for the
  -- legacy format and to the option's index for the flat one, so storing 0 for
  -- "absent" would make the flat default unreproducible. Read with NULLS LAST.
  sort_order          integer,

  -- Provenance, and the backfill's idempotency key. See the column comment in
  -- shared/schema.ts: option ids inside templateData are frequently absent, so
  -- the fallback is positional (`idx:0`, or `idx:2/1` for items[2].options[1]).
  template_option_id  text,

  -- The legacy `itemName` format nests options under items, and an item is a
  -- SELECTION with no table of its own. Until those are promoted to real
  -- templates, these preserve the grouping rather than losing it.
  legacy_item_index   integer,
  legacy_item_name    text,

  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

-- Reading a template's options in display order is the only hot query.
CREATE INDEX IF NOT EXISTS selection_template_options_template_idx
  ON selection_template_options (template_id, sort_order);

-- "Where is this product used?" and tenant scoping.
CREATE INDEX IF NOT EXISTS selection_template_options_product_idx
  ON selection_template_options (product_id);
CREATE INDEX IF NOT EXISTS selection_template_options_company_idx
  ON selection_template_options (company_id);

-- One row per option, so a second backfill pass updates instead of duplicating.
-- PARTIAL because template_option_id is null for rows created by hand later.
CREATE UNIQUE INDEX IF NOT EXISTS selection_template_options_template_option_unique
  ON selection_template_options (template_id, template_option_id)
  WHERE template_option_id IS NOT NULL;

-- products gains the one genuinely spec-level field the blob carried.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS specifications json;
