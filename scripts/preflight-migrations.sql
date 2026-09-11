-- Which of migrations 0069-0076 are actually on THIS database?
--
-- SELECT-only. Run it before applying anything, and run it against the
-- database you are about to deploy to — not the one the Shell hands you by
-- default, which is dev.
--
--   psql "$PROD_URL" -f scripts/preflight-migrations.sql
--
-- Every migration in this range is additive and idempotent, so applying one
-- that is already there is harmless. This exists so you know what you are
-- changing before you change it, not to decide whether it is safe.

\echo ''
\echo '=== Which database is this? Identify by ROW COUNTS, never by host name. ==='
SELECT
  (SELECT count(*) FROM companies)  AS companies,
  (SELECT count(*) FROM projects)   AS projects,
  (SELECT count(*) FROM users)      AS users,
  (SELECT count(*) FROM variations) AS variations,
  current_database()                AS db,
  inet_server_addr()                AS host;

\echo ''
\echo '=== Migration state. applied = every object that migration creates exists. ==='
WITH obj AS (
  SELECT m, kind, name, parent FROM (VALUES
    ('0069 proposal_send',        'col', 'sent_pdf_path',            'proposals'),
    ('0069 proposal_send',        'col', 'sent_to',                  'proposals'),
    ('0070 proposal_reminders',   'col', 'reminders_enabled',        'proposals'),
    ('0070 proposal_reminders',   'tbl', 'proposal_reminder_templates', NULL),
    ('0070 proposal_reminders',   'tbl', 'proposal_reminder_log',    NULL),
    ('0071 estimate_group_vis',   'col', 'proposal_visible',         'estimate_groups'),
    ('0072 product_groups_tags',  'tbl', 'product_groups',           NULL),
    ('0072 product_groups_tags',  'tbl', 'product_tags',             NULL),
    ('0072 product_groups_tags',  'tbl', 'product_tag_assignments',  NULL),
    ('0072 product_groups_tags',  'col', 'group_id',                 'products'),
    ('0072 product_groups_tags',  'col', 'source',                   'products'),
    ('0073 variation_archive',    'tbl', 'variation_sends',          NULL),
    ('0073 variation_archive',    'col', 'signed_send_id',           'variations'),
    ('0074 email_deliveries',     'tbl', 'email_deliveries',         NULL),
    ('0074 email_deliveries',     'col', 'email_delivery_id',        'variation_sends'),
    ('0075 variation_supersedes', 'col', 'supersedes_variation_id',  'variations'),
    ('0076 company_logo',         'col', 'logo_data',                'company_settings'),
    ('0076 company_logo',         'col', 'logo_mime',                'company_settings')
  ) AS t(m, kind, name, parent)
),
present AS (
  SELECT obj.*,
    CASE WHEN kind = 'tbl' THEN EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = obj.name)
         ELSE EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = obj.parent AND column_name = obj.name)
    END AS ok
  FROM obj
)
SELECT
  m AS migration,
  CASE WHEN bool_and(ok) THEN 'applied'
       WHEN bool_or(ok)  THEN 'PARTIAL — look at this'
       ELSE 'MISSING' END AS state,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS objects,
  coalesce(string_agg(coalesce(parent || '.', '') || name, ', ')
             FILTER (WHERE NOT ok), '') AS missing
FROM present
GROUP BY m
ORDER BY m;
