-- Product Library: first real migration (0067) for `products` and `product_images`.
--
-- Both tables only ever existed as `db:push` drift — they have no migration in
-- this directory, exactly as `price_list_*` did before 0051. That means no one
-- can say from the repo whether they exist on prod, and a deploy that assumes
-- them 500s on every /api/products call (the 0065 lesson).
--
-- So this file is a BASELINE, not a change: it creates both tables only if they
-- are missing, and adds the index either way. On an environment where `db:push`
-- already made them, every statement is a no-op. Safe to replay.
--
-- Column types mirror shared/schema.ts exactly:
--   products.id / product_images.id are serial (integer), NOT the varchar uuid
--   used elsewhere in this schema — selection_options.product_id is an integer
--   FK onto it, so the type must not drift.
--   default_unit_cost is CENTS. The Product Library form was posting `unitCost`
--   against this `default_unit_cost` column; Drizzle builds statements from the
--   table's own columns, so the value was dropped in silence on both insert and
--   update. Fixed in the client alongside this migration.

CREATE TABLE IF NOT EXISTS products (
  id                  serial PRIMARY KEY,
  company_id          varchar NOT NULL REFERENCES companies(id),
  name                text NOT NULL,
  brand               text,
  sku                 text,
  description         text,
  category            text,
  subcategory         text,
  supplier_contact_id varchar REFERENCES contacts(id),
  default_unit_cost   integer,
  unit_type           text,
  url                 text,
  notes               text,
  is_active           boolean DEFAULT true,
  created_at          timestamp DEFAULT now(),
  updated_at          timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id         serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path  text NOT NULL,
  file_name  text,
  mime_type  text,
  file_size  integer,
  sort_order integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

-- getProducts() is WHERE company_id = $1 [AND is_active = $2] ORDER BY name.
-- The composite serves both the filter and the sort, and still acts as a plain
-- company_id index for everything else.
--
-- NOT concurrent: unlike 0057 on `contacts`, this table is small and barely read
-- today, so a brief lock is cheaper than the split-file handling CONCURRENTLY
-- forces. That also lets this whole file run inside one transaction.
CREATE INDEX IF NOT EXISTS products_company_id_name_idx
  ON products (company_id, name);

-- product_images is always read by product_id.
CREATE INDEX IF NOT EXISTS product_images_product_id_idx
  ON product_images (product_id);
