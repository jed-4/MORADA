-- Records an edit made to a bill AFTER it was approved as an entry in that
-- bill's approval history, so an approval row can't silently stop describing
-- the bill it approved.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block that
-- later uses the new value. This statement is standalone and idempotent; run
-- it on its own before deploying the code that writes 'edited'.
ALTER TYPE "bill_approval_status" ADD VALUE IF NOT EXISTS 'edited';
