-- A selection template's options carry the client charge too (cents INC GST
-- per unit), so saving a project as a template — or pricing a template option
-- with cost / markup / charge — keeps the charge to the cent when applied.
-- Additive and idempotent; also ensured at boot (ensureSelectionPricingColumns).
ALTER TABLE selection_template_options ADD COLUMN IF NOT EXISTS unit_charge integer;
