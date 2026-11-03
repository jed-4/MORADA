-- System configuration per company. Until now system_configuration was ONE
-- row for the whole app: every company's document prefixes, start numbers,
-- GST rate, timezone, fiscal year and payment terms were the same row, and any
-- company admin's PUT /api/system-configuration rewrote them for everyone.
--
-- Adds company_id and gives every company its own copy of the existing global
-- row, so nothing anyone sees changes on the day this runs. The global row
-- (company_id NULL) stays as the fallback for a company that has no row yet.
--
-- Additive and idempotent: the backfill only inserts for companies that have
-- no row, so a re-run is a no-op.

ALTER TABLE system_configuration ADD COLUMN IF NOT EXISTS company_id varchar REFERENCES companies(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS system_configuration_company_uq ON system_configuration (company_id);

INSERT INTO system_configuration (
  company_id,
  language, measurement_system, currency, currency_symbol, timezone,
  temperature_format, date_format, time_format,
  estimate_prefix, variation_prefix, client_invoice_prefix, bill_prefix,
  purchase_order_prefix, rfq_prefix, rfi_prefix, proposal_prefix,
  estimate_start_number, variation_start_number, client_invoice_start_number,
  bill_start_number, purchase_order_start_number, rfq_start_number,
  rfi_start_number, proposal_start_number,
  gst_rate, fiscal_year_start, default_payment_terms,
  job_numbering_mode, job_number_format,
  phase_lead_active, phase_pre_construction_active, phase_construction_active,
  phase_post_construction_active, phase_archive_active,
  lead_prefix, pre_construction_prefix, construction_prefix,
  lead_start_number, pre_construction_start_number, construction_start_number
)
SELECT
  c.id,
  g.language, g.measurement_system, g.currency, g.currency_symbol, g.timezone,
  g.temperature_format, g.date_format, g.time_format,
  g.estimate_prefix, g.variation_prefix, g.client_invoice_prefix, g.bill_prefix,
  g.purchase_order_prefix, g.rfq_prefix, g.rfi_prefix, g.proposal_prefix,
  g.estimate_start_number, g.variation_start_number, g.client_invoice_start_number,
  g.bill_start_number, g.purchase_order_start_number, g.rfq_start_number,
  g.rfi_start_number, g.proposal_start_number,
  g.gst_rate, g.fiscal_year_start, g.default_payment_terms,
  g.job_numbering_mode, g.job_number_format,
  g.phase_lead_active, g.phase_pre_construction_active, g.phase_construction_active,
  g.phase_post_construction_active, g.phase_archive_active,
  g.lead_prefix, g.pre_construction_prefix, g.construction_prefix,
  g.lead_start_number, g.pre_construction_start_number, g.construction_start_number
FROM companies c
CROSS JOIN (
  SELECT * FROM system_configuration
  WHERE company_id IS NULL
  ORDER BY created_at
  LIMIT 1
) g
WHERE NOT EXISTS (
  SELECT 1 FROM system_configuration s WHERE s.company_id = c.id
);
