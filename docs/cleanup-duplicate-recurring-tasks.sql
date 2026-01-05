-- =====================================================
-- CLEANUP DUPLICATE RECURRING TASKS
-- =====================================================
-- This script identifies and removes duplicate recurring tasks
-- caused by the template_id:date vs template_id:date:assignee_id key mismatch
--
-- RUN IN PRODUCTION DATABASE ONLY
-- =====================================================

-- STEP 1: Identify duplicates (run this first to review)
-- =====================================================
SELECT 
  n.template_id,
  DATE(n.due_date) as due_date,
  n.assignee_id,
  COUNT(*) as duplicate_count,
  array_agg(n.id ORDER BY n.created_at DESC) as task_ids,
  array_agg(n.title ORDER BY n.created_at DESC) as titles,
  array_agg(n.status ORDER BY n.created_at DESC) as statuses,
  array_agg(n.created_at ORDER BY n.created_at DESC) as created_dates
FROM notes n
WHERE n.type = 'task' 
  AND n.template_id IS NOT NULL
GROUP BY n.template_id, DATE(n.due_date), n.assignee_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- STEP 2: Preview which tasks would be deleted (keeps newest)
-- =====================================================
WITH duplicates AS (
  SELECT 
    n.id,
    n.template_id,
    DATE(n.due_date) as due_date,
    n.assignee_id,
    n.title,
    n.status,
    n.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY n.template_id, DATE(n.due_date), n.assignee_id 
      ORDER BY n.created_at DESC
    ) as rn
  FROM notes n
  WHERE n.type = 'task' 
    AND n.template_id IS NOT NULL
)
SELECT id, template_id, due_date, assignee_id, title, status, created_at
FROM duplicates
WHERE rn > 1
ORDER BY created_at DESC;

-- STEP 3: DELETE duplicates (keeps the NEWEST task for each group)
-- =====================================================
-- CAUTION: Run STEP 1 and STEP 2 first to verify!
-- =====================================================
WITH duplicates AS (
  SELECT 
    n.id,
    n.template_id,
    n.due_date,
    n.assignee_id,
    ROW_NUMBER() OVER (
      PARTITION BY n.template_id, DATE(n.due_date), n.assignee_id 
      ORDER BY n.created_at DESC
    ) as rn
  FROM notes n
  WHERE n.type = 'task' 
    AND n.template_id IS NOT NULL
)
DELETE FROM notes
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- =====================================================
-- ALTERNATIVE: DELETE duplicates keeping the OLDEST task
-- (use this if the older tasks have the correct data)
-- =====================================================
-- WITH duplicates AS (
--   SELECT 
--     n.id,
--     n.template_id,
--     n.due_date,
--     n.assignee_id,
--     ROW_NUMBER() OVER (
--       PARTITION BY n.template_id, DATE(n.due_date), n.assignee_id 
--       ORDER BY n.created_at ASC
--     ) as rn
--   FROM notes n
--   WHERE n.type = 'task' 
--     AND n.template_id IS NOT NULL
-- )
-- DELETE FROM notes
-- WHERE id IN (
--   SELECT id FROM duplicates WHERE rn > 1
-- );
