-- A record of every email the app sends, and what became of it.
--
-- sendGenericEmail persisted nothing across all eighteen of its call sites, so
-- "Sent" meant only "a provider accepted the request". A variation went to an
-- address that does not exist, the provider accepted it, Google bounced it
-- asynchronously, and the app went on showing Sent — with no message id to look
-- up and nothing listening for the bounce.
--
-- Written at the choke point (sendGenericEmail) rather than per feature, so all
-- eighteen paths get it rather than the two that happened to be under repair.
CREATE TABLE IF NOT EXISTS email_deliveries (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable: onboarding and the reminder schedulers send without a company in
  -- scope, and those sends still deserve a record.
  company_id          varchar,
  user_id             varchar REFERENCES users(id) ON DELETE SET NULL,

  sent_at             timestamp NOT NULL DEFAULT now(),
  to_addresses        jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject             text,

  -- 'gmail' when it went through the user's own account, 'resend' otherwise.
  provider            text,
  -- The provider's id. Without it a specific send cannot be looked up at all.
  provider_message_id text,

  -- sent      — provider accepted it; nothing more is known yet
  -- delivered — the receiving server accepted it
  -- bounced   — rejected; status_detail carries the reason
  -- complained— marked as spam by the recipient
  -- failed    — the send itself threw; it never reached a provider
  status              text NOT NULL DEFAULT 'sent',
  status_detail       text,
  status_updated_at   timestamp,

  -- What the email was about, so a document can show its own delivery history
  -- without a join table per feature.
  context_type        text,
  context_id          varchar
);

-- "Show me this variation's emails."
CREATE INDEX IF NOT EXISTS email_deliveries_context_idx
  ON email_deliveries (context_type, context_id, sent_at DESC);

-- The webhook's only lookup key.
CREATE INDEX IF NOT EXISTS email_deliveries_message_idx
  ON email_deliveries (provider_message_id);

CREATE INDEX IF NOT EXISTS email_deliveries_company_idx
  ON email_deliveries (company_id, sent_at DESC);

-- Tie a variation's send to its delivery record.
--
-- The activity feed already derives "Sent" from variation_sends; this lets the
-- same row say whether that email actually arrived, instead of the two facts
-- sitting in separate tables joined by a guess at the timestamp.
--
-- Deliberately no FK: a delivery row is a log line, and losing one must never
-- be able to block deleting a send.
ALTER TABLE variation_sends
  ADD COLUMN IF NOT EXISTS email_delivery_id varchar;
