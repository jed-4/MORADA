-- RFQ numbering: monotonic per-company counter + uniqueness.
--
-- The legacy generator built the number from the project name plus a count of
-- existing RFQs, so deleting an RFQ freed its number for reuse and concurrent
-- creates raced. An RFQ number is emailed to suppliers, so reuse means a number
-- can refer to two different documents.
--
-- Numbering is company-scoped rather than per-project: the RFQ list is a
-- cross-project registry, and projectId is due to become nullable so that
-- off-system enquiries can be logged without a job.
--
-- (Numbered 0038: 0036 is taken by the unmerged feat/allowances branch and
-- 0037 by feat/dashboard-widgets-wave-e.)

-- 1. Resolve any duplicates that the old generator already produced: keep the
--    oldest of each set, suffix the rest with a short id fragment.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, rfq_number
           ORDER BY created_at, id
         ) AS rn
  FROM rfqs
)
UPDATE rfqs r
SET rfq_number = r.rfq_number || '-' || LEFT(r.id::text, 4)
FROM ranked k
WHERE k.id = r.id AND k.rn > 1;

-- 2. The counter itself.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS rfq_last_number integer NOT NULL DEFAULT 0;

-- 3. Seed it past anything already issued, so the first generated number after
--    this migration cannot collide with a legacy one. Legacy numbers look like
--    "HIGH-RFQ-003"; the trailing digits are what the generator increments.
UPDATE companies c
SET rfq_last_number = GREATEST(c.rfq_last_number, seeded.max_seq)
FROM (
  SELECT company_id,
         COALESCE(MAX(NULLIF(SUBSTRING(rfq_number FROM '(\d+)$'), '')::integer), 0) AS max_seq
  FROM rfqs
  GROUP BY company_id
) AS seeded
WHERE c.id = seeded.company_id;

-- 4. Enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS rfqs_company_number_unique
  ON rfqs (company_id, rfq_number);
