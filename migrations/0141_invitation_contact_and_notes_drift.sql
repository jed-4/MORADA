-- 0141: columns schema.ts has always had but no migration ever created.
--
-- They reached dev through the old `db:push` postMerge hook (removed in #39),
-- so any database that was only ever migrated by hand can be missing them.
--
--   user_invitations.contact_id — missing on prod: GET and POST /api/invitations
--     both fail with `column "contact_id" does not exist`, so the Team page
--     lists no pending invites and no invite can be sent.
--   notes.* — the task columns (tasks live in `notes`) most likely to have
--     drifted the same way. All nullable or defaulted.
--
-- Every statement is ADD COLUMN IF NOT EXISTS: a no-op wherever the column is
-- already there, so this is safe on prod, Replit-dev and ep-jolly-tooth alike.
-- Run it on all three (a column missing from Replit-dev is proposed for DROP
-- from prod by the next publish). Run scripts/audit-notes-columns.sql first
-- and after; it is read-only.

ALTER TABLE "user_invitations"
  ADD COLUMN IF NOT EXISTS "contact_id" varchar REFERENCES "contacts"("id");

ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "task_context_type" text;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "task_context_id" varchar;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "checklist_instance_id" varchar;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "checklist_instance_name" text;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "assignee_ids" text[] DEFAULT '{}';
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "assignee_names" json DEFAULT '[]'::json;
