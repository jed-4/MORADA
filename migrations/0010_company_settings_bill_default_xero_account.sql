-- Add default Xero AccountCode for bills (task #122)
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "bill_default_xero_account" text;
