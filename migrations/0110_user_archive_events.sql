-- A record of archiving and restoring team members: who, when, and what of
-- theirs was handed to someone else. Shown on the Team page's Archived tab.
-- A separate table rather than columns on users, so a database that hasn't run
-- this yet loses only the "archived on/by" line — not every request (users is
-- read on all of them). Additive; also created at boot.
CREATE TABLE IF NOT EXISTS user_archive_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,                 -- 'archived' | 'restored'
  by_user_id varchar,
  by_name text,
  reassigned_to_id varchar,
  reassigned_to_name text,
  summary jsonb,                        -- counts of what moved, e.g. {"tasks":3}
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_archive_events_user_idx ON user_archive_events (user_id, created_at DESC);
