-- At most one bill per (company, xero_invoice_id): prevents duplicate imports of
-- the same Xero invoice (the race the xeroBillDedup service currently cleans up
-- after the fact). Partial so the many bills with a NULL xero_invoice_id don't
-- collide.
--
-- NOTE: if this fails with a unique-violation, existing duplicates must be merged
-- first via server/services/xeroBillDedup.ts (dedupXeroBills), then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS "bills_company_xero_invoice_unique"
  ON "bills" ("company_id", "xero_invoice_id")
  WHERE "xero_invoice_id" IS NOT NULL;
