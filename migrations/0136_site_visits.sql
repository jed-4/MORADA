-- Arriving on site (#46): a site sign-in register, plus the company switches.
--
-- site_visits is one row per arrival at a job site, recorded by the phone's
-- geofence (source 'geofence'). It is SEPARATE from timesheets on purpose:
-- a visit never changes a timesheet, and a visit is kept even if the person
-- never clocks in. Approvers see it next to the timesheet ("arrived on site
-- about 6:42").
--
--   arrived_at / left_at          the device's event time (bounded by the server:
--                                 never in the future, never more than 24h old).
--   client_request_id             the phone's id for the arrive event. Unique
--                                 per user so an offline-queued arrive that is
--                                 replayed never makes a second row.
--   leave_client_request_id       the same for the leave event.
--
-- Only arrivals and departures at company job sites are stored, never a trail
-- of positions — there are no coordinates in this table at all.
-- Rows are deleted after 12 months by the daily sweep (server/services/siteVisits.ts).
--
-- company_settings switches:
--   geofence_enabled       the whole feature (default OFF — opt in per company).
--   geofence_store_visits  keep the register; off = prompts only, nothing stored.
--   geofence_hours_*       prompts only inside these hours (HH:MM, company time).
--   geofence_weekends      prompts on Saturday/Sunday too.
--
-- Additive and idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS site_visits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  arrived_at timestamp NOT NULL,
  left_at timestamp,
  source text NOT NULL DEFAULT 'geofence',
  client_request_id text,
  leave_client_request_id text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_visits_user_request_uq
  ON site_visits (user_id, client_request_id);
CREATE INDEX IF NOT EXISTS site_visits_company_user_arrived_idx
  ON site_visits (company_id, user_id, arrived_at);
CREATE INDEX IF NOT EXISTS site_visits_open_idx
  ON site_visits (user_id, project_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS site_visits_arrived_idx
  ON site_visits (arrived_at);

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS geofence_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS geofence_store_visits boolean NOT NULL DEFAULT true;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS geofence_hours_start text NOT NULL DEFAULT '05:00';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS geofence_hours_end text NOT NULL DEFAULT '19:00';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS geofence_weekends boolean NOT NULL DEFAULT false;
