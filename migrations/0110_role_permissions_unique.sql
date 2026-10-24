-- A role holds each permission at most once.
--
-- role_permissions had only an `id` primary key, so nothing refused a second
-- row for the same (role_id, permission_id). Boot-time backfills inserted a
-- grant and caught 23505 assuming a duplicate would be refused — it never was,
-- so a re-run doubled the grants (74 rows for 37 roles on dev, 2026-10-22).
--
-- The readers disagree on what two rows mean, which is why this matters:
--   requirePermission (the route gate)        → passes if ANY row allows it
--   checkUserPermission / userHasPermission   → whichever row Postgres returns first
--   /api/auth/user effectivePermissions (UI)  → the LAST row
-- so a disagreeing pair can let a route through that the UI hides, or 403 a
-- check the route gate would pass.
--
-- Merge rule — nobody loses a right they could exercise through any reader:
--   allowed_actions   = union of every row's actions
--   view_scope        = the widest: all > selected_roles > own
--   viewable_role_ids = union of every row's ids
-- The earliest row (created_at, then id) is kept and receives the merged
-- values; the rest are deleted. This is exactly what requirePermission already
-- enforced for actions, so no route changes behaviour.
--
-- Idempotent: with no duplicates both statements touch nothing, and the index
-- is IF NOT EXISTS. If a duplicate is inserted between the DELETE and the
-- CREATE INDEX the index build fails loudly — run the file again.
--
-- Check first (read-only):
--   npx tsx --env-file-if-exists=.env scripts/role-permission-duplicates.ts

-- 1. Write the merged grant onto the row each group keeps.
WITH dup AS (
  SELECT role_id, permission_id
  FROM role_permissions
  GROUP BY role_id, permission_id
  HAVING count(*) > 1
),
keeper AS (
  SELECT DISTINCT ON (rp.role_id, rp.permission_id) rp.id, rp.role_id, rp.permission_id
  FROM role_permissions rp
  JOIN dup USING (role_id, permission_id)
  ORDER BY rp.role_id, rp.permission_id, rp.created_at, rp.id
),
actions AS (
  SELECT rp.role_id, rp.permission_id,
         coalesce(json_agg(DISTINCT a.v ORDER BY a.v) FILTER (WHERE a.v IS NOT NULL), '[]'::json) AS allowed_actions
  FROM role_permissions rp
  JOIN dup USING (role_id, permission_id)
  LEFT JOIN LATERAL json_array_elements_text(
    CASE WHEN json_typeof(rp.allowed_actions) = 'array' THEN rp.allowed_actions ELSE '[]'::json END
  ) AS a(v) ON true
  GROUP BY rp.role_id, rp.permission_id
),
viewable AS (
  SELECT rp.role_id, rp.permission_id,
         coalesce(json_agg(DISTINCT v.v ORDER BY v.v) FILTER (WHERE v.v IS NOT NULL), '[]'::json) AS viewable_role_ids
  FROM role_permissions rp
  JOIN dup USING (role_id, permission_id)
  LEFT JOIN LATERAL json_array_elements_text(
    CASE WHEN json_typeof(rp.viewable_role_ids) = 'array' THEN rp.viewable_role_ids ELSE '[]'::json END
  ) AS v(v) ON true
  GROUP BY rp.role_id, rp.permission_id
),
scope AS (
  SELECT rp.role_id, rp.permission_id,
         (array_agg(rp.view_scope ORDER BY
            CASE rp.view_scope WHEN 'all' THEN 3 WHEN 'selected_roles' THEN 2 WHEN 'own' THEN 1 ELSE 0 END DESC
          ))[1] AS view_scope
  FROM role_permissions rp
  JOIN dup USING (role_id, permission_id)
  GROUP BY rp.role_id, rp.permission_id
)
UPDATE role_permissions t
SET allowed_actions   = actions.allowed_actions,
    view_scope        = scope.view_scope,
    viewable_role_ids = viewable.viewable_role_ids
FROM keeper
JOIN actions  USING (role_id, permission_id)
JOIN viewable USING (role_id, permission_id)
JOIN scope    USING (role_id, permission_id)
WHERE t.id = keeper.id;

-- 2. Delete every row that has an earlier sibling — leaves the keeper above.
DELETE FROM role_permissions rp
USING role_permissions k
WHERE k.role_id = rp.role_id
  AND k.permission_id = rp.permission_id
  AND (k.created_at, k.id) < (rp.created_at, rp.id);

-- 3. Refuse duplicates from now on.
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_permission_unique
  ON role_permissions (role_id, permission_id);
