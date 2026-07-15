-- Allowance custom lines become full line items, and split timesheets can be
-- allocated per cost-code portion. All additive; the quantity change is a safe
-- integer → double precision widening.

ALTER TABLE "allowance_items" ADD COLUMN IF NOT EXISTS "item_name" text;
ALTER TABLE "allowance_items" ADD COLUMN IF NOT EXISTS "cost_code" text;
ALTER TABLE "allowance_items" ADD COLUMN IF NOT EXISTS "unit_type" text NOT NULL DEFAULT 'each';
ALTER TABLE "allowance_items" ADD COLUMN IF NOT EXISTS "unit_cost_ex_tax_cents" integer;
ALTER TABLE "allowance_items" ADD COLUMN IF NOT EXISTS "markup_percent" double precision;
ALTER TABLE "allowance_items" ALTER COLUMN "quantity" TYPE double precision;
ALTER TABLE "allowance_items" ADD COLUMN IF NOT EXISTS "source_selection_id" varchar
  REFERENCES "selections"("id") ON DELETE SET NULL;

ALTER TABLE "timesheet_allowances" ADD COLUMN IF NOT EXISTS "timesheet_cost_code_id" varchar
  REFERENCES "timesheet_cost_codes"("id") ON DELETE CASCADE;
