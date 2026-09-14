-- The HBCF limits grid becomes a forward plan.
--
-- Before this, hbcf_projects.statuses was a map of {"2026-01-05": true} and the
-- only way a job occupied a week was for someone to click that week's cell. That
-- records the past adequately and plans the future not at all: a job starting in
-- March means clicking thirty boxes, and moving it means clicking sixty.
--
-- So a row now carries a start and an end, and the weeks it occupies are derived.
--
-- Everything here is ADDITIVE. No column is renamed or dropped, so the order of
-- migrate and deploy does not matter: code running before this lands still finds
-- every column it reads, and code running after it finds max_value and statuses
-- exactly where they were.

-- H01..H05 under icare (NSW). Nullable and free-text rather than an enum: the
-- codes are one state's taxonomy, and the construction limits they key into are
-- stored the same generic way on company_settings below.
ALTER TABLE hbcf_projects ADD COLUMN IF NOT EXISTS job_type text;

-- ISO 'YYYY-MM-DD', matching the compliance date fields on company_settings.
ALTER TABLE hbcf_projects ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE hbcf_projects ADD COLUMN IF NOT EXISTS end_date text;

-- 'predicted' — a job we expect to run, priced off the live estimate
-- 'actual'    — contracted, priced off the frozen contract sum
-- Defaulting to predicted is the safe direction: a row nobody has classified
-- shows as a forecast rather than overstating committed exposure.
ALTER TABLE hbcf_projects ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'predicted';

ALTER TABLE hbcf_projects ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- Carry the clicked weeks across, so existing rows arrive with a date range
-- instead of an empty one. The keys are Mondays of ON weeks, so the last one
-- plus six days is the Sunday that week ends.
--
-- Only rows that have not already been given dates are touched, which makes the
-- statement safe to repeat. Gaps are lost: a job toggled on, off, then on again
-- becomes one continuous run. That is the right trade — the alternative is
-- modelling multiple ranges per row to preserve something nobody entered
-- deliberately — but it is why `statuses` is kept rather than dropped. Once the
-- timeline reads right, a later migration can drop it.
UPDATE hbcf_projects
   SET start_date = (SELECT min(k) FROM jsonb_object_keys(statuses) AS k),
       end_date   = to_char(
                      (SELECT max(k) FROM jsonb_object_keys(statuses) AS k)::date + 6,
                      'YYYY-MM-DD')
 WHERE start_date IS NULL
   AND end_date IS NULL
   AND statuses IS NOT NULL
   AND jsonb_typeof(statuses) = 'object'
   AND statuses <> '{}'::jsonb;

-- A row carried over from the toggle grid was only ever clicked for weeks that
-- had already happened or were already committed, so it is contracted work.
UPDATE hbcf_projects
   SET basis = 'actual'
 WHERE start_date IS NOT NULL
   AND basis = 'predicted'
   AND statuses IS NOT NULL
   AND statuses <> '{}'::jsonb;

-- ── Limits ──────────────────────────────────────────────────────────────────
-- hwi_exposure_limit already exists and holds the dollar cap across all open
-- jobs. Eligibility is capped two ways, though, and the second is a job count.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS hwi_job_count_limit integer;

-- Per-job maximums, keyed by job type: [{ code, label, limit }].
--
-- jsonb rather than five columns because the codes are icare's NSW taxonomy and
-- VIC/QLD name their categories differently. NULLABLE WITH NO DEFAULT: a default
-- here could not be told apart from a builder who genuinely holds those limits,
-- and one of the real values is $0 (no approval to build apartment buildings),
-- which is a meaningful entry rather than an empty one.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS hwi_construction_limits jsonb;
