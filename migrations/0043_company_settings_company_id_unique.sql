-- One settings row per company.
--
-- Reads of company_settings are now scoped by company_id and the old unscoped
-- `LIMIT 1` fallback is gone, so a company owning two rows would make which
-- settings it sees (including its Gmail bill-inbox credentials) depend on
-- planner order. Nothing has ever enforced one row per company.
--
-- PRE-FLIGHT — run this on BOTH dev and prod before applying:
--   node scripts/check-company-settings-duplicates.mjs
-- Unlike 0030, this migration deliberately does NOT auto-dedupe. Choosing which
-- of two settings rows is authoritative (whose Gmail tokens are live, whose
-- company name is current) is a judgment call, and picking wrong silently
-- disconnects a tenant's bill inbox. If the pre-flight reports duplicates,
-- resolve them by hand first — CREATE UNIQUE INDEX will fail loudly, not
-- corrupt anything, but the migration will not complete.
--
-- NULL company_id: Postgres allows multiple NULLs in a unique index, so legacy
-- unowned rows do not block this. They are unreachable by the application now
-- that reads are scoped, and the pre-flight flags them.

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_company_id_unique
  ON company_settings (company_id)
  WHERE company_id IS NOT NULL;
