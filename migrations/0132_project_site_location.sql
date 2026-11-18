-- Project site location: real coordinates for the job site, alongside the
-- free-text address in projects.location.
--
-- Used today by the "Site map" project widget, the "Job map" company dashboard
-- widget and the Site location block in Project Settings. Designed so the
-- planned "arriving on site" geofence can reuse the same columns:
--
--   site_latitude / site_longitude  WGS84 degrees. NULL = no location yet.
--   site_radius_m                   geofence radius in metres (default 150).
--   site_location_source            how the point was set:
--                                     'pin'      — someone dragged the pin
--                                     'on_site'  — captured from a phone on site
--                                     'geocoded' — looked up from the address
--                                   A geocoded point never overwrites a 'pin'
--                                   or 'on_site' one (enforced in the route).
--   site_location_set_at / _by      when, and which user, last set the point.
--
-- Additive and idempotent: safe to run more than once. No backfill here — the
-- Job map widget has a "Find locations" button that geocodes existing jobs.
-- 0131 is reserved by the defects branch.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_latitude double precision;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_longitude double precision;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_radius_m integer DEFAULT 150;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_location_source text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_location_set_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_location_set_by varchar;
