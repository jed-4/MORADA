-- Subcontractor timesheets are hours only (#418, 16 Nov): their cost comes
-- through their PO and bill, and every save path has forced rate / total to 0
-- since then. Rows entered BEFORE that still carry a rate (e.g. 8h x $60 =
-- $480) and were never cleaned — the clean-up script shipped with #418 was not
-- run on prod. Those amounts counted as job labour on top of the subbie's
-- bill (the 22 Boanyo Roof Framing double count).
--
-- This zeroes hourly_rate and total on subcontractor timesheets and their
-- cost-code splits. Hours, dates, status, cost codes and PO links are left
-- alone. POs are unaffected: they price hours off the PROFILE rate.
--
-- RUN scripts/preview-0140-zero-subbie-timesheets.sql FIRST and check the
-- names. "Subcontractor" means users.is_subcontractor today, so anyone who
-- used to be staff would have their old staff timesheets zeroed too.
--
-- Data only, idempotent (re-running touches nothing). 0139 is the budget
-- forecast tables.

BEGIN;

UPDATE timesheet_cost_codes s
SET hourly_rate = 0, total = 0, updated_at = now()
FROM timesheets t
JOIN users u ON u.id = t.user_id
WHERE t.id = s.timesheet_id
  AND u.is_subcontractor = true
  AND (s.hourly_rate <> 0 OR s.total <> 0);

UPDATE timesheets t
SET hourly_rate = 0, total = 0, updated_at = now()
FROM users u
WHERE u.id = t.user_id
  AND u.is_subcontractor = true
  AND (t.hourly_rate <> 0 OR t.total <> 0);

COMMIT;
