-- Trial lifecycle emails (welcome, day-3 tip, day-10 "4 days left",
-- post-expiry). One row per (company, email) records a send; the UNIQUE index
-- is what guarantees each email goes out at most once per company, since the
-- hourly sweep claims a send by inserting here before calling Resend.
--
-- Mirrors ensureOnboardingEmailTable() in server/services/onboardingEmails.ts,
-- which creates the same objects at boot (deploy runs no migrations).
CREATE TABLE IF NOT EXISTS onboarding_email_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email_key varchar(40) NOT NULL,
  to_email text NOT NULL,
  sent_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_email_log_company_key_unique
  ON onboarding_email_log (company_id, email_key);
