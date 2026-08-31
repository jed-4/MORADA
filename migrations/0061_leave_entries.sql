-- Leave: marking who is away, so the business calendar can show it.
--
-- Deliberately NOT leave management — no requests, no approvals, no balances, no
-- accrual, no payroll. Those are a separate product decision. This is the table a
-- shared calendar needs to answer "who is not in this week".
--
-- Numbering: main reached 0062 while this branch was in flight (0059, 0060 and
-- 0062 are the variations work). 0061 was never claimed, so this keeps it; the
-- other two migrations on this branch are 0063 and 0064.
--
-- Per project convention: apply BY HAND via psql — dev first, then prod. Never
-- db:push (it has proposed DROPs on this schema before).

CREATE TABLE IF NOT EXISTS leave_entries (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         VARCHAR NOT NULL REFERENCES users(id)     ON DELETE CASCADE,

  -- Inclusive dates at UTC midnight: the UI posts a plain yyyy-MM-dd, so the date
  -- part round-trips exactly and consumers compare the first 10 characters. NOT
  -- the local-midnight convention notes.due_date uses — a day-granular field has
  -- no business carrying a timezone.
  -- A single day has start_date = end_date.
  start_date      TIMESTAMP NOT NULL,
  end_date        TIMESTAMP NOT NULL,

  -- Only meaningful on a single-day entry.
  is_half_day     BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_period TEXT,

  -- A field_options.key from the leave.type category, so the list is editable in
  -- Field Settings rather than needing a migration to add "long service".
  leave_type      TEXT NOT NULL,
  note            TEXT,

  created_by      VARCHAR REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT leave_entries_dates_ordered CHECK (end_date >= start_date),
  CONSTRAINT leave_entries_half_day_single CHECK (NOT is_half_day OR start_date = end_date),
  CONSTRAINT leave_entries_half_day_period CHECK (
    (NOT is_half_day AND half_day_period IS NULL)
    OR (is_half_day AND half_day_period IN ('am', 'pm'))
  )
);

CREATE INDEX IF NOT EXISTS leave_entries_company_idx ON leave_entries (company_id);
-- The calendar's only query shape: this company, overlapping this range.
CREATE INDEX IF NOT EXISTS leave_entries_company_range_idx ON leave_entries (company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS leave_entries_user_idx ON leave_entries (user_id);

-- Leave types, per company, in the same shape as every other Field Settings list.
-- field_categories/field_options are company-scoped as of 0056, so this seeds one
-- category per existing company. Idempotent: re-running adds nothing.
INSERT INTO field_categories (key, label, entity, description, is_built_in, is_active, sort_order, company_id)
SELECT 'leave.type', 'Leave Types', 'leave', 'Kinds of leave that can be marked on the calendar', TRUE, TRUE, 0, c.id
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM field_categories fc WHERE fc.key = 'leave.type' AND fc.company_id = c.id
);

INSERT INTO field_options (category_id, key, name, color, is_active, is_default, sort_order, company_id)
SELECT fc.id, v.key, v.name, v.color, TRUE, v.key = 'annual', v.sort_order, fc.company_id
FROM field_categories fc
CROSS JOIN (VALUES
  ('annual',        'Annual Leave',   '#70CAD0', 0),
  ('sick',          'Sick Leave',     '#DA988A', 1),
  ('unpaid',        'Unpaid Leave',   '#9B9B9B', 2),
  ('rdo',           'RDO',            '#D4B670', 3),
  ('public_holiday','Public Holiday', '#82C8A2', 4),
  ('other',         'Other',          '#87749A', 5)
) AS v(key, name, color, sort_order)
WHERE fc.key = 'leave.type'
  AND NOT EXISTS (
    SELECT 1 FROM field_options fo WHERE fo.category_id = fc.id AND fo.key = v.key
  );
