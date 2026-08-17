-- Double-billed variation audit — READ ONLY (SELECT only, no writes).
--
-- Finds variations claimed on more than one client invoice, and any whose
-- cumulative claim percent exceeds 100% (the actual over-billing signal).
--
-- Run against REAL PRODUCTION from the Replit Shell:
--     psql "$PROD_URL" -f scripts/audit-double-billed-variations.sql
--
-- Identify prod by ROW COUNTS, never by host name (query 0 below). Real prod
-- reads ~19,000+ activities, 400+ bills, 4 companies. If it looks like dev
-- (15 bills, 12 companies, 'Tenant Test Co …' names), STOP — wrong database.

\echo '=== 0. Row counts — confirm this is production before trusting anything below ==='
SELECT 'companies' AS t, count(*) AS n FROM companies
UNION ALL SELECT 'projects',           count(*) FROM projects
UNION ALL SELECT 'bills',              count(*) FROM bills
UNION ALL SELECT 'variations',         count(*) FROM variations
UNION ALL SELECT 'client_invoices',    count(*) FROM client_invoices
UNION ALL SELECT 'invoice_variations', count(*) FROM invoice_variations
ORDER BY 1;

\echo ''
\echo '=== 1. Variations on MORE THAN ONE invoice (summary) ==='
\echo '    total_claim_pct <= 100 is a legitimate split progress claim.'
\echo '    total_claim_pct >  100 is over-billing — over_claimed_aud is the amount.'
SELECT
  c.name                                  AS company,
  p.name                                  AS project,
  v.variation_number                      AS variation,
  v.name                                  AS variation_name,
  v.status                                AS var_status,
  round(v.total_amount / 100.0, 2)        AS var_total_aud,
  count(*)                                AS invoice_count,
  sum(iv.claim_percent)                   AS total_claim_pct,
  round(sum(v.total_amount * iv.claim_percent / 100.0) / 100.0, 2) AS claimed_aud,
  round((sum(v.total_amount * iv.claim_percent / 100.0) - v.total_amount) / 100.0, 2) AS over_claimed_aud
FROM invoice_variations iv
JOIN variations      v ON v.id = iv.variation_id
JOIN client_invoices i ON i.id = iv.invoice_id
JOIN projects        p ON p.id = v.project_id
LEFT JOIN companies  c ON c.id = p.company_id
GROUP BY c.name, p.name, v.id, v.variation_number, v.name, v.status, v.total_amount
HAVING count(*) > 1
ORDER BY over_claimed_aud DESC NULLS LAST, c.name, p.name, v.variation_number;

\echo ''
\echo '=== 2. Same variations, per-invoice detail ==='
WITH multi AS (
  SELECT variation_id FROM invoice_variations GROUP BY variation_id HAVING count(*) > 1
)
SELECT
  c.name                           AS company,
  p.name                           AS project,
  v.variation_number               AS variation,
  round(v.total_amount / 100.0, 2) AS var_total_aud,
  i.invoice_number                 AS invoice,
  i.name                           AS invoice_name,
  i.status                         AS inv_status,
  i.invoice_date::date             AS inv_date,
  iv.claim_percent                 AS claim_pct,
  round(v.total_amount * iv.claim_percent / 100.0 / 100.0, 2) AS this_claim_aud,
  round(i.total_amount / 100.0, 2) AS invoice_total_aud,
  round(i.paid_amount  / 100.0, 2) AS invoice_paid_aud,
  i.xero_invoice_number            AS xero_invoice
FROM invoice_variations iv
JOIN multi           m ON m.variation_id = iv.variation_id
JOIN variations      v ON v.id = iv.variation_id
JOIN client_invoices i ON i.id = iv.invoice_id
JOIN projects        p ON p.id = v.project_id
LEFT JOIN companies  c ON c.id = p.company_id
ORDER BY c.name, p.name, v.variation_number, i.invoice_date, i.invoice_number;

\echo ''
\echo '=== 3. Cumulative claim > 100% (over-billed, even if on a single invoice) ==='
SELECT
  c.name                 AS company,
  p.name                 AS project,
  v.variation_number     AS variation,
  sum(iv.claim_percent)  AS total_claim_pct,
  count(*)               AS invoice_count,
  round((sum(v.total_amount * iv.claim_percent / 100.0) - v.total_amount) / 100.0, 2) AS over_claimed_aud
FROM invoice_variations iv
JOIN variations     v ON v.id = iv.variation_id
JOIN projects       p ON p.id = v.project_id
LEFT JOIN companies c ON c.id = p.company_id
GROUP BY c.name, p.name, v.id, v.variation_number, v.total_amount
HAVING sum(iv.claim_percent) > 100
ORDER BY over_claimed_aud DESC;

\echo ''
\echo '=== 4. Exact duplicates — same variation twice on the SAME invoice ==='
SELECT
  i.invoice_number   AS invoice,
  v.variation_number AS variation,
  count(*)           AS rows
FROM invoice_variations iv
JOIN client_invoices i ON i.id = iv.invoice_id
JOIN variations      v ON v.id = iv.variation_id
GROUP BY i.invoice_number, v.variation_number
HAVING count(*) > 1;

\echo ''
\echo '=== 5. Same check for ALLOWANCE claims (same guard, same shape) ==='
SELECT
  c.name                AS company,
  p.name                AS project,
  ei.description        AS allowance_item,
  count(*)              AS invoice_count,
  sum(ia.claim_percent) AS total_claim_pct,
  round(ei.price_inc_tax::numeric, 2) AS line_total_aud,
  round((sum(ei.price_inc_tax * ia.claim_percent / 100.0) - ei.price_inc_tax)::numeric, 2) AS over_claimed_aud
FROM invoice_allowances ia
JOIN estimate_items  ei ON ei.id = ia.estimate_item_id
JOIN client_invoices i  ON i.id = ia.invoice_id
JOIN projects        p  ON p.id = i.project_id
LEFT JOIN companies  c  ON c.id = p.company_id
GROUP BY c.name, p.name, ei.id, ei.description, ei.price_inc_tax
HAVING count(*) > 1
ORDER BY over_claimed_aud DESC NULLS LAST;
