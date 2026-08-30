-- Meetings you can schedule, rather than only ones that already happened.
--
-- The business calendar's "meetings" source was going to read minutes.meeting_date,
-- which is backwards: `minutes` is a record of a meeting that has ALREADY taken
-- place, so a calendar built on it can only ever show you the past. A calendar's
-- job is to show you Thursday's site meeting before Thursday.
--
-- So meetings become a real scheduled entity, and minutes attach to the meeting
-- they came from instead of the two being unrelated rows that happen to share a
-- date.
--
-- NOT the same as a schedule_item of type 'meeting'. Those live inside a project
-- schedule with Gantt semantics, dependencies and working-day snapping. A Tuesday
-- management meeting is not a Gantt row.
--
-- Renumbered from 0063 alongside the migration before it — see its header.
-- Already applied to dev under the old name; nothing to re-run there.
--
-- Per project convention: apply BY HAND via psql — dev first, then prod. Never
-- db:push.

CREATE TABLE IF NOT EXISTS meetings (
  id                   VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  title                TEXT NOT NULL,
  -- Real timestamps, unlike the day-granular leave dates: a meeting is a time.
  starts_at            TIMESTAMP NOT NULL,
  ends_at              TIMESTAMP NOT NULL,

  location             TEXT,
  video_url            TEXT,
  agenda               TEXT,

  -- Optional: a management meeting belongs to no job.
  project_id           VARCHAR REFERENCES projects(id) ON DELETE SET NULL,

  -- Arrays rather than a join table, matching notes.assignee_ids. Attendees are
  -- read as a whole list every time and never queried across, so a join table
  -- would buy nothing and cost a query.
  attendee_user_ids    TEXT[] NOT NULL DEFAULT '{}',
  attendee_contact_ids TEXT[] NOT NULL DEFAULT '{}',

  created_by           VARCHAR REFERENCES users(id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT meetings_ends_after_starts CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS meetings_company_idx ON meetings (company_id);
-- The calendar's query shape: this company, overlapping this range.
CREATE INDEX IF NOT EXISTS meetings_company_range_idx ON meetings (company_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS meetings_project_idx ON meetings (project_id);

-- Minutes record what happened at a meeting. SET NULL rather than CASCADE:
-- deleting a scheduled meeting must never destroy the record of it.
ALTER TABLE minutes
  ADD COLUMN IF NOT EXISTS meeting_id VARCHAR REFERENCES meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS minutes_meeting_idx ON minutes (meeting_id);

-- No backfill. Existing minutes keep a null meeting_id: inferring which meeting a
-- historical minute belonged to would mean guessing from dates and titles, and a
-- wrong link is worse than no link.
