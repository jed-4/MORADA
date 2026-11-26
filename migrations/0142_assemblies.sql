-- 0142: estimate assemblies.
--
-- A company-level recipe ("Slab Pour", per m²) that drops into an estimate as
-- one line with its components as sub-items. Components are PER UNIT of the
-- assembly or FIXED, so changing the assembly line's quantity rescales them.
-- See shared/assemblies.ts.
--
-- Additive only: two new tables, six nullable/defaulted columns on
-- estimate_items. Safe to run before or after the deploy, but the estimate grid
-- reads the new columns, so run it on prod BEFORE deploying the code.
-- IF NOT EXISTS throughout so it can be re-run.

CREATE TABLE IF NOT EXISTS "assemblies" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "unit_type" text NOT NULL DEFAULT 'm2',
  "cost_code_id" varchar REFERENCES "cost_codes"("id") ON DELETE SET NULL,
  "is_archived" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assemblies_company_idx" ON "assemblies" ("company_id");

CREATE TABLE IF NOT EXISTS "assembly_components" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "assembly_id" varchar NOT NULL REFERENCES "assemblies"("id") ON DELETE CASCADE,
  "order" integer NOT NULL DEFAULT 0,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'Material',
  "price_list_item_id" varchar REFERENCES "price_list_items"("id") ON DELETE SET NULL,
  "unit_type" text NOT NULL DEFAULT 'each',
  "unit_cost_cents" integer NOT NULL DEFAULT 0,
  "qty_mode" text NOT NULL DEFAULT 'per_unit',
  "qty_factor" double precision NOT NULL DEFAULT 1,
  "wastage_percent" integer NOT NULL DEFAULT 0,
  "markup_percent" double precision,
  "cost_code_id" varchar REFERENCES "cost_codes"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "assembly_components_assembly_idx" ON "assembly_components" ("assembly_id");

ALTER TABLE "estimate_items"
  ADD COLUMN IF NOT EXISTS "assembly_id" varchar REFERENCES "assemblies"("id") ON DELETE SET NULL;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_version" integer;
ALTER TABLE "estimate_items"
  ADD COLUMN IF NOT EXISTS "assembly_component_id" varchar REFERENCES "assembly_components"("id") ON DELETE SET NULL;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_qty_mode" text;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_qty_factor" double precision;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_qty_overridden" boolean NOT NULL DEFAULT false;
