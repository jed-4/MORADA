-- Price Lists: turn the flat company catalogue into a LIBRARY of price lists.
--
-- Context: price_list_categories / price_list_items / bill_line_item_price_links were
-- never created by a .sql migration — they only ever existed as `db:push` drift captured
-- in drizzle meta snapshots. This migration is written to be safe whether or not those
-- tables already exist, and is idempotent so it can be replayed on dev and prod.
--
-- Both catalogues were empty at authoring time (0 rows in dev), so the backfill below is
-- expected to be a no-op. It is written properly anyway in case prod differs.

-- 1. The list "kind" — drives which fields/columns make sense for a list.
DO $$ BEGIN
  CREATE TYPE price_list_kind AS ENUM ('supplier', 'labour', 'internal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. The library header.
CREATE TABLE IF NOT EXISTS price_lists (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  kind             price_list_kind NOT NULL DEFAULT 'supplier',
  supplier_id      varchar REFERENCES contacts(id) ON DELETE SET NULL,
  description      text,
  colour           text,
  is_default       boolean NOT NULL DEFAULT false,
  is_archived      boolean NOT NULL DEFAULT false,
  effective_from   timestamp,
  effective_to     timestamp,
  source_note      text,
  last_imported_at timestamp,
  created_by       varchar REFERENCES users(id),
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_lists_company_idx  ON price_lists (company_id);
CREATE INDEX IF NOT EXISTS price_lists_supplier_idx ON price_lists (supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS price_lists_name_unique ON price_lists (company_id, name);

-- 2b. Groups: a section INSIDE one price list ("Plasterboard", "Cornice").
--     Replaces the company-global price_list_categories, which sat outside any list.
CREATE TABLE IF NOT EXISTS price_list_groups (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  price_list_id varchar NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  colour        text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_list_groups_company_idx    ON price_list_groups (company_id);
CREATE INDEX IF NOT EXISTS price_list_groups_price_list_idx ON price_list_groups (price_list_id);
CREATE UNIQUE INDEX IF NOT EXISTS price_list_groups_name_unique ON price_list_groups (price_list_id, name);

-- 3. Items belong to exactly one list, sit in a group, and carry a cost code.
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS price_list_id varchar;
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS group_id      varchar;
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS cost_code_id  varchar;

-- 4. Unit of measure: pgEnum -> text.
--    The enum had 14 values while the form offered 19, so 12 of 19 choices were insert
--    errors. Units now come from Field Settings and are reconciled by shared/units.ts.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_list_items' AND column_name = 'unit_type'
      AND udt_name = 'unit_type'
  ) THEN
    ALTER TABLE price_list_items
      ALTER COLUMN unit_type DROP DEFAULT,
      ALTER COLUMN unit_type TYPE text USING unit_type::text;
    ALTER TABLE price_list_items ALTER COLUMN unit_type SET DEFAULT 'each';
  END IF;
END $$;

-- Normalise the legacy enum spellings to the Field Settings vocabulary.
UPDATE price_list_items SET unit_type = 'm'  WHERE unit_type = 'lin_m';
UPDATE price_list_items SET unit_type = 'hr' WHERE unit_type = 'hour';

-- 5. Backfill: any company holding orphan items gets one "General" list.
INSERT INTO price_lists (company_id, name, kind, description)
SELECT DISTINCT pli.company_id,
       'General',
       'internal'::price_list_kind,
       'Auto-created by migration 0049 to hold items that predated price lists.'
FROM price_list_items pli
WHERE pli.price_list_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM price_lists pl
    WHERE pl.company_id = pli.company_id AND pl.name = 'General'
  );

UPDATE price_list_items pli
SET price_list_id = pl.id
FROM price_lists pl
WHERE pli.price_list_id IS NULL
  AND pl.company_id = pli.company_id
  AND pl.name = 'General';

-- 6. Now it can be mandatory.
ALTER TABLE price_list_items ALTER COLUMN price_list_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE price_list_items
    ADD CONSTRAINT price_list_items_price_list_id_fk
    FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE price_list_items
    ADD CONSTRAINT price_list_items_cost_code_id_fk
    FOREIGN KEY (cost_code_id) REFERENCES cost_codes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE price_list_items
    ADD CONSTRAINT price_list_items_group_id_fk
    FOREIGN KEY (group_id) REFERENCES price_list_groups(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS price_list_items_price_list_idx ON price_list_items (price_list_id);
CREATE INDEX IF NOT EXISTS price_list_items_group_idx      ON price_list_items (group_id);

-- 7. Retire the company-global categories, superseded by per-list groups.
--    Any existing category becomes a group on the list its items landed in; a
--    category with no items is dropped. Expected to be a no-op (0 rows).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'price_list_categories') THEN

    INSERT INTO price_list_groups (company_id, price_list_id, name, description, colour, sort_order)
    SELECT DISTINCT ON (pli.price_list_id, plc.name)
           plc.company_id, pli.price_list_id, plc.name, plc.description, plc.color, plc.sort_order
    FROM price_list_categories plc
    JOIN price_list_items pli ON pli.category_id = plc.id
    ON CONFLICT (price_list_id, name) DO NOTHING;

    UPDATE price_list_items pli
    SET group_id = plg.id
    FROM price_list_categories plc
    JOIN price_list_groups plg ON plg.name = plc.name
    WHERE pli.category_id = plc.id
      AND plg.price_list_id = pli.price_list_id
      AND pli.group_id IS NULL;

    ALTER TABLE price_list_items DROP COLUMN IF EXISTS category_id;
    DROP TABLE price_list_categories;
  END IF;
END $$;
