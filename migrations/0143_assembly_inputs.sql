-- 0143: named inputs on estimate assemblies (phase 3).
--
-- An assembly's own quantity is its first input ("Area"); it can declare more
-- (Thickness 0.1 m, Edge length) and a component's quantity can be a recipe
-- over them: `Area × Thickness × 1.05`. See shared/assemblies.ts.
--
-- Additive only: nullable / defaulted columns. Needs 0142 first. The estimate
-- grid reads the new estimate_items columns, so run it on prod BEFORE deploying.
-- IF NOT EXISTS throughout so it can be re-run.

ALTER TABLE "assemblies" ADD COLUMN IF NOT EXISTS "quantity_label" text;
ALTER TABLE "assemblies" ADD COLUMN IF NOT EXISTS "inputs" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "assembly_components" ADD COLUMN IF NOT EXISTS "qty_formula" text;

ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_qty_formula" text;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_qty_label" text;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "assembly_inputs" jsonb;
