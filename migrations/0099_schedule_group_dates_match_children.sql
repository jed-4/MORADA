-- Pull every schedule group back onto the span of its children.
--
-- A group's bar is defined as min(child start) / max(child end), and the app
-- recomputes it from scratch whenever a child is edited. But only on that one
-- path: the dependency cascade writes successors through a storage helper that
-- never touches parents, so every cascade left the groups containing those
-- successors a little further out of step.
--
-- Nothing looked wrong while it sat there. It surfaced on the next drag INSIDE
-- such a group: the recompute released the whole accumulated gap at once, the
-- group's end moved by it, and the cascade pushed every dependent of the group
-- the same distance — days, with no relation to how far the bar was dragged.
-- That is the "schedule jumps a week when I nudge something" report.
--
-- The code no longer creates the drift (the cascade now settles the groups it
-- moved). This clears what is already stored, so the next drag on an existing
-- job does not release one last jump.
--
-- ⚠️ THIS ONE CHANGES DATA. Read before running.
--
--   * It only touches rows that ARE groups (have children) and whose stored
--     dates already disagree with those children. Everything else is untouched,
--     and a second run finds nothing left to do.
--
--   * It moves GROUP bars only — never a real task, and never a dependency.
--     The children keep the dates they have; the group is what was wrong.
--
--   * Count first, and look at the size of the gaps:
--
--       SELECT p.id, p.name,
--              p.start_date::date AS stored_start, p.end_date::date AS stored_end,
--              min(c.start_date)::date AS child_min, max(c.end_date)::date AS child_max,
--              (max(c.end_date)::date - p.end_date::date) AS end_drift_days
--       FROM schedule_items p
--       JOIN schedule_items c ON c.parent_item_id = p.id
--       GROUP BY p.id, p.name, p.start_date, p.end_date
--       HAVING max(c.end_date)::date <> p.end_date::date
--           OR min(c.start_date)::date <> p.start_date::date
--       ORDER BY abs(max(c.end_date)::date - p.end_date::date) DESC;
--
--     On the dev database this reported two groups, drifting 6 and 4 days.
--
--   * Dependents are NOT moved. A group that was wrong may have had work placed
--     against its wrong end; this puts the group right without re-planning the
--     job behind anyone's back. The next deliberate edit cascades as normal —
--     and now correctly, because the group no longer has a gap to release.
--
-- Idempotent: re-running finds no rows.

UPDATE schedule_items p
SET start_date = k.child_min,
    end_date   = k.child_max,
    updated_at = now()
FROM (
  SELECT c.parent_item_id AS parent_id,
         min(c.start_date) AS child_min,
         max(c.end_date)   AS child_max
  FROM schedule_items c
  WHERE c.parent_item_id IS NOT NULL
  GROUP BY c.parent_item_id
) AS k
WHERE p.id = k.parent_id
  AND k.child_min IS NOT NULL
  AND k.child_max IS NOT NULL
  AND (p.start_date IS DISTINCT FROM k.child_min
    OR p.end_date   IS DISTINCT FROM k.child_max);
