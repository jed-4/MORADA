-- Move the client-invoice default Xero account onto company_settings (per company),
-- mirroring bill_default_xero_account. The previous column on system_configuration
-- was mislocated (global) and never persisted via /api/company-settings, so there is
-- effectively no data to migrate — but copy any stray value across just in case.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS client_invoice_default_xero_account text;

-- Best-effort copy of any previously-stored value (system_configuration is a single
-- global row). Safe no-op if the source column/row is empty.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_configuration'
      AND column_name = 'client_invoice_default_xero_account'
  ) THEN
    UPDATE company_settings cs
    SET client_invoice_default_xero_account = sc.client_invoice_default_xero_account
    FROM system_configuration sc
    WHERE cs.client_invoice_default_xero_account IS NULL
      AND sc.client_invoice_default_xero_account IS NOT NULL;

    ALTER TABLE system_configuration
      DROP COLUMN IF EXISTS client_invoice_default_xero_account;
  END IF;
END $$;
