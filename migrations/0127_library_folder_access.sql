-- Who can SEE and who can EDIT a Library folder's documents, set per folder
-- (Jed, 2026-11-15: viewing and editing must be separate — a carpenter who
-- reads SOPs must not be able to change them).
--
--   view_role_ids  NULL = inherit from the parent folder; at the top level,
--                  everyone with Library access. A list = only those roles.
--   edit_role_ids  NULL = inherit; at the top level, ADMINS ONLY. A list =
--                  those roles (still needing the Library "edit" permission).
-- Admins can always see and edit. Documents follow their folder; unfiled
-- documents use the top-level defaults.
--
-- 0125 / 0126 are #399 / #401. Additive and idempotent.

ALTER TABLE doc_folders ADD COLUMN IF NOT EXISTS view_role_ids text[];
ALTER TABLE doc_folders ADD COLUMN IF NOT EXISTS edit_role_ids text[];
