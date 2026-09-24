-- Schedule dates that were stored as an instant rather than a day.
--
-- schedule_items.start_date / end_date are timestamps, but a programme bar is a
-- DAY: every reader takes the first 10 characters of the ISO string, i.e. the
-- UTC date. The dependency cascade in the schedule-item PATCH built its dates
-- with setHours(0,0,0,0) — LOCAL midnight — so on a server east of UTC it wrote
-- 2026-11-09 as 2026-11-08T13:00:00Z, and the Gantt drew that bar a day early,
-- overlapping the predecessor it was supposed to follow.
--
-- The code no longer writes these (shared/scheduleDates.ts: scheduleDayUTC).
-- This repairs the rows already written that way.
--
-- ⚠️ THIS ONE CHANGES DATA, unlike every other migration in this folder.
-- Read before running:
--
--   * It only touches rows whose time-of-day is not midnight UTC. A row stored
--     correctly (…T00:00:00.000Z) is left exactly as it is, so on a server that
--     has always run in UTC this migration is a no-op — check the count first:
--
--       SELECT count(*) FROM schedule_items
--       WHERE start_date::time <> '00:00' OR end_date::time <> '00:00';
--
--   * For the rows it does touch, it keeps the day the write INTENDED — the
--     Australian calendar day of that instant — not the day the Gantt has been
--     drawing. So those bars move one day LATER, back to where their dependency
--     puts them. That is the repair; it is not cosmetic, and it will change
--     dates people have looked at. Expect it to affect only cascade-written
--     successors.
--
--   * Worth eyeballing the affected rows first:
--
--       SELECT id, name, start_date, end_date,
--              (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney')::date
--                AS intended_start
--       FROM schedule_items
--       WHERE start_date::time <> '00:00' OR end_date::time <> '00:00'
--       ORDER BY updated_at DESC;
--
--   * The double AT TIME ZONE is not a typo. The column is `timestamp` WITHOUT
--     a zone, and everything reads it as UTC, so the stored wall clock is first
--     declared UTC and then converted to Sydney to recover the day the write
--     meant. A single conversion reads the wall clock as Sydney time and takes
--     the date a day the WRONG way.
--
-- Idempotent: a second run finds nothing left to change.
UPDATE schedule_items
SET start_date = ((start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney')::date)::timestamp,
    end_date   = ((end_date   AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney')::date)::timestamp
WHERE start_date::time <> '00:00:00'
   OR end_date::time   <> '00:00:00';
