-- Index contacts.company_id.
--
-- `contacts.company_id` is a foreign key, and Postgres does NOT create an index
-- for the referencing side of an FK. Every read of the table is scoped by it:
--
--   getContacts()  -> WHERE company_id = $1 [AND contact_type = $2] ORDER BY name
--   getContact()   -> WHERE id = $1 AND company_id = $2
--
-- getContacts() is one of the hottest queries in the app — 39 client files
-- query /api/contacts, and the contacts page, every supplier/trade/client
-- picker, the schedule and the global search all pull the full list. Without an
-- index that is a sequential scan plus a sort on every one of them.
--
-- The composite mirrors the query shape so the planner can satisfy both the
-- filter and the ORDER BY from the index, and it still serves the plain
-- company_id lookups used by getContact() and the bulk statements as a prefix.
--
-- CONCURRENTLY so this does not take an exclusive lock on a table the whole app
-- reads. It therefore cannot run inside a transaction — apply this file on its
-- own, not batched with other migrations.
--
-- Safe to re-run; IF NOT EXISTS. If a previous attempt was interrupted, check
-- for an INVALID index first:
--   SELECT indexrelid::regclass FROM pg_index
--   WHERE NOT indisvalid AND indexrelid::regclass::text LIKE 'contacts_%';
-- and DROP INDEX it before re-running.

CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_company_id_name_idx
  ON contacts (company_id, name);
