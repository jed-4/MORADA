-- READ ONLY preview for migration 0140 (zero subcontractor timesheet costs).
-- Paste into the Neon SQL editor on PROD and run BEFORE 0140. Changes nothing.
--
-- One row per subcontractor who still has a timesheet (or split) carrying a
-- rate / total. Check the list:
--   * Everyone named should be a subcontractor who has ALWAYS been one.
--   * "no_po_status" counts timesheets with no PO status — fine for a subbie
--     whose hours were never queued for a PO, but if a name here used to be
--     STAFF, those may be their old staff timesheets: do not run 0140, tell
--     Claude which person, and it will be narrowed.
--   * "first_date" / "last_date" show the span being zeroed.

WITH sub_ts AS (
  SELECT t.id, t.date, t.status, t.po_status, t.total, u.id AS user_id,
         coalesce(nullif(trim(u.first_name || ' ' || coalesce(u.last_name, '')), ''), 'Unnamed') AS who
  FROM timesheets t
  JOIN users u ON u.id = t.user_id
  WHERE u.is_subcontractor = true
),
costed_ts AS (
  SELECT * FROM sub_ts s
  WHERE EXISTS (SELECT 1 FROM timesheets t WHERE t.id = s.id AND (t.hourly_rate <> 0 OR t.total <> 0))
     OR EXISTS (SELECT 1 FROM timesheet_cost_codes c WHERE c.timesheet_id = s.id AND (c.hourly_rate <> 0 OR c.total <> 0))
)
SELECT who,
       count(*)                                         AS timesheets,
       count(*) FILTER (WHERE status = 'approved')      AS approved,
       count(*) FILTER (WHERE po_status IS NULL)        AS no_po_status,
       min(date)::date                                  AS first_date,
       max(date)::date                                  AS last_date,
       round(sum(total)::numeric, 2)                    AS dollars_on_timesheets
FROM costed_ts
GROUP BY who
ORDER BY dollars_on_timesheets DESC;
