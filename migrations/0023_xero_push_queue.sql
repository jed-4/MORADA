-- Outbox for Xero bill pushes: durable queue so a failed push (Xero down, 429,
-- network) retries in the background with backoff instead of being lost.
CREATE TABLE IF NOT EXISTS "xero_push_queue" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" varchar NOT NULL REFERENCES "companies"("id"),
  "bill_id" varchar NOT NULL REFERENCES "bills"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 6,
  "last_error" text,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- At most one active (pending/processing) job per bill.
CREATE UNIQUE INDEX IF NOT EXISTS "xero_push_queue_bill_active_unique"
  ON "xero_push_queue" ("bill_id") WHERE status IN ('pending','processing');

-- Fast "what's due" scan for the worker.
CREATE INDEX IF NOT EXISTS "xero_push_queue_due_idx"
  ON "xero_push_queue" ("status", "next_attempt_at");
