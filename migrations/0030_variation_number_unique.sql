-- Variation numbers must be unique per project. The legacy generator was
-- count-based (deleting a variation freed its number for reuse) and raced on
-- concurrent creates, so duplicates may exist: rename all but the oldest of
-- each duplicate set by appending a short id suffix, then enforce uniqueness.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, variation_number
           ORDER BY created_at, id
         ) AS rn
  FROM variations
)
UPDATE variations v
SET variation_number = v.variation_number || '-' || LEFT(v.id::text, 4)
FROM ranked r
WHERE r.id = v.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS variations_project_number_unique
  ON variations (project_id, variation_number);
