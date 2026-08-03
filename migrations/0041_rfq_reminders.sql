-- RFQ reminders: company-level templates + a send log.
--
-- The old design wrote four rfq_follow_ups rows per RFQ at send time and
-- nothing ever read them — there was no scheduler, so no reminder was ever
-- sent. Templates live once per company (every RFQ chases the same way; each
-- RFQ opts in via rfqs.follow_up_enabled), and the log records what actually
-- went out.
--
-- rfq_follow_ups is deliberately left in place but is now unused; it can be
-- dropped once we're confident nothing external reads it.

DO $$ BEGIN
  CREATE TYPE rfq_reminder_trigger AS ENUM ('after_send', 'before_due');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rfq_reminder_templates (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           text NOT NULL,
  trigger        rfq_reminder_trigger NOT NULL DEFAULT 'after_send',
  offset_days    integer NOT NULL,
  subject        text NOT NULL,
  body           text NOT NULL,
  enabled        boolean NOT NULL DEFAULT true,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_reminder_templates_company_idx
  ON rfq_reminder_templates (company_id);

CREATE TABLE IF NOT EXISTS rfq_reminder_log (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id        varchar NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  recipient_id  varchar NOT NULL REFERENCES rfq_recipients(id) ON DELETE CASCADE,
  template_id   varchar REFERENCES rfq_reminder_templates(id) ON DELETE SET NULL,
  subject       text,
  body          text,
  to_email      text,
  status        text NOT NULL DEFAULT 'sent',
  error         text,
  sent_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_reminder_log_rfq_idx ON rfq_reminder_log (rfq_id);

-- The double-send guard. A reminder is claimed by inserting its log row, so
-- this constraint IS the lock: an overlapping sweep, a retry after a crash, or
-- a second process gets a conflict instead of emailing the supplier twice.
CREATE UNIQUE INDEX IF NOT EXISTS rfq_reminder_log_once_per_recipient
  ON rfq_reminder_log (recipient_id, template_id)
  WHERE template_id IS NOT NULL;
