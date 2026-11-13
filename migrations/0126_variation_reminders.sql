-- Chasing a client who hasn't signed a variation.
--
-- Same model as proposal reminders: the steps (timing + wording) are set per
-- company in Settings → Variation Reminders, and chasing is switched on per
-- variation — OFF by default, so nobody's client gets an automated email
-- because a default was left on. The log's unique (variation, template, email)
-- index is the lock that stops a reminder going out twice.
--
-- Note: 0125 is purchase_orders.amended_at (PR #399). Additive and idempotent.

ALTER TABLE variations ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS variation_reminder_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger text NOT NULL DEFAULT 'after_send',
  offset_days integer NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS variation_reminder_templates_company_idx ON variation_reminder_templates (company_id);

CREATE TABLE IF NOT EXISTS variation_reminder_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id varchar NOT NULL REFERENCES variations(id) ON DELETE CASCADE,
  template_id varchar REFERENCES variation_reminder_templates(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  sent_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS variation_reminder_log_once_idx ON variation_reminder_log (variation_id, template_id, to_email);
