-- The home warranty insurance certificate for one job.
--
-- hbcf_projects, added earlier, tracks aggregate eligibility: a hand-keyed row
-- per job with a max value, toggled ACTIVE week by week, totalled against
-- company_settings.hwi_exposure_limit. That answers "how much open work am I
-- carrying" — it holds no policy number, no premium, no dates, no certificate.
-- company_settings holds one hwi_policy_number, which is the builder's own
-- eligibility, not the per-job cover a client is entitled to see.
--
-- So nothing in the app recorded the certificates themselves. This table does.
--
-- Deliberately insurer-agnostic. No scheme thresholds and no warranty periods
-- are encoded: the same row serves HBCF (NSW), DBI/VMIA (VIC), QBCC (QLD) or
-- private cover. In particular the two expiry dates are stored, not derived
-- from cover_start plus a hard-coded 6/2 years — those periods differ by
-- scheme and have been changed by legislation, and a derived date would go
-- quietly wrong for historical jobs.
CREATE TABLE IF NOT EXISTS hbcf_certificates (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Nullable: jobs that predate the app, or never got a project record, still
  -- need their certificate registered. job_name carries the label in that case.
  project_id             varchar REFERENCES projects(id) ON DELETE SET NULL,
  job_name               text NOT NULL DEFAULT '',
  site_address           text,

  insurer                text,
  policy_number          text,
  certificate_number     text,

  -- not_required | not_applied | applied | issued | cancelled
  status                 text NOT NULL DEFAULT 'not_applied',

  -- Dollars, matching hbcf_projects.max_value. Drizzle returns numeric as text.
  contract_value         numeric(15,2),
  premium                numeric(15,2),

  -- ISO 'YYYY-MM-DD' strings, matching the compliance fields on
  -- company_settings rather than the timestamp columns used elsewhere.
  date_applied           text,
  date_issued            text,
  cover_start            text,
  structural_expiry      text,
  non_structural_expiry  text,

  certificate_url        text,
  notes                  text,

  sort_order             integer NOT NULL DEFAULT 0,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

-- Every read is scoped by company_id; there is no other access path.
CREATE INDEX IF NOT EXISTS hbcf_certificates_company_idx
  ON hbcf_certificates (company_id);
