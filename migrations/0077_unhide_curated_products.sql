-- Give back the products 0072 hid. (migration 0077)
--
-- 0072 added `products.source` so the library could hide SHADOWS — rows the
-- templateData write-through mints when an option describes a product instead
-- of referencing one. The column is right. Its backfill was not:
--
--   UPDATE products SET source = 'template_shadow'
--   WHERE source = 'library'
--     AND EXISTS (SELECT 1 FROM selection_template_options
--                  WHERE product_id = products.id);
--
-- The comment above it read "Anything already linked when this runs came from
-- the backfill, which only ever created shadows. A user-linked product cannot
-- exist yet: the picker did not keep productId until the change that ships
-- alongside this."
--
-- That was wrong. The picker DID keep productId, so a product added to the
-- library by hand and then offered as an option in a template was already
-- linked, and 0072 stamped it a shadow. On the dev database that was every
-- product there was: four Colorbond colours, filed in "Roofing › Colours",
-- tagged "Colorbond standard", created six seconds apart by hand — and
-- /api/products returned zero. An empty Product Library also empties the
-- product picker and the tag bulk-add that read from it, so the feature the
-- colours were added for stopped working too.
--
-- ── How this tells a real product from a mint ────────────────────────────────
--
-- A group or a tag. Neither can be set by anything but the library UI:
--
--   * syncTemplateOptions' productValues (server/services/templateOptionSync.ts)
--     writes name/brand/sku/description/category/subcategory/cost/unit/url/
--     specifications and nothing else. No group_id, no tag rows.
--   * scripts/backfill-product-library.ts writes the same set. It does create
--     product_images, which is why images are NOT used as the test here.
--   * scripts/backfill-product-groups.ts, which 0072's header says would file
--     existing category text into groups, was never written — there is no such
--     file in the repo. So no automated process has ever set group_id.
--
-- So group_id IS NOT NULL, or a product_tag_assignments row, means a person put
-- this product somewhere. A mint is left alone.
--
-- Idempotent and safe to replay: it only ever moves rows from shadow back to
-- library, and the WHERE clause is unchanged by having run.
UPDATE products p
SET source = 'library'
WHERE p.source = 'template_shadow'
  AND (
    p.group_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM product_tag_assignments a WHERE a.product_id = p.id)
  );
