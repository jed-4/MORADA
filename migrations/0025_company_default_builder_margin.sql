-- Backs the Estimates `company_settings.default_builder_margin_percent` column
-- (shipped in schema.ts in the Estimates commit with no migration file).
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS
  default_builder_margin_percent double precision NOT NULL DEFAULT 0;
