-- Proposal reminders: chase a client who hasn't responded.
--
-- Off by default and opted into per proposal — chasing a client is not chasing
-- a supplier, and nothing should email a homeowner because a default was left
-- switched on.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;

-- Guarded like every other enum in this directory (see 0041, 0039, 0013):
-- Postgres has no CREATE TYPE IF NOT EXISTS, and this file is applied by hand
-- to THREE databases — Replit-dev, prod, and the local Neon branch. Bare, a
-- re-run or a second target aborts the whole transaction on "type already
-- exists" while every other statement here is idempotent.
DO $$ BEGIN
  CREATE TYPE proposal_reminder_trigger AS ENUM ('after_send', 'before_expiry');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS proposal_reminder_templates (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  trigger       proposal_reminder_trigger NOT NULL DEFAULT 'after_send',
  offset_days   integer NOT NULL,
  subject       text NOT NULL,
  body          text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_reminder_templates_company_idx
  ON proposal_reminder_templates (company_id);

-- What was actually sent, to whom, off which template.
--
-- The unique (proposal, template, email) index below is the concurrency
-- control, not just a record: the scheduler claims a reminder by INSERTing its
-- log row before the email goes out, so a retry, an overlapping hourly tick or
-- a second app instance hits the constraint instead of emailing a client
-- twice. Same mechanism as rfq_reminder_log.
CREATE TABLE IF NOT EXISTS proposal_reminder_log (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id varchar NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  template_id varchar REFERENCES proposal_reminder_templates(id) ON DELETE SET NULL,
  to_email    text NOT NULL,
  subject     text,
  body        text,
  status      text NOT NULL DEFAULT 'sent',
  error       text,
  sent_at     timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS proposal_reminder_log_once_idx
  ON proposal_reminder_log (proposal_id, template_id, to_email);

CREATE INDEX IF NOT EXISTS proposal_reminder_log_proposal_idx
  ON proposal_reminder_log (proposal_id);
