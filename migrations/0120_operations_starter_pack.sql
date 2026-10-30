-- Operations Phase 4: starter pack. One row per pack item a company has been
-- given (folder, SOP, task template). The pack content lives in code
-- (server/services/operationsStarterPack.ts); every install is a COPY with the
-- company's own id. The unique key makes a repeat install a no-op, and a row
-- outlives a deleted copy so deleting a starter SOP is final.
--
-- Additive and idempotent. Needs 0118/0119 only for the copies, not the table.

CREATE TABLE IF NOT EXISTS operations_starter_installs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  kind text NOT NULL,
  target_id varchar,
  pack_version integer NOT NULL,
  installed_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS operations_starter_installs_company_item_uq ON operations_starter_installs (company_id, item_key);
