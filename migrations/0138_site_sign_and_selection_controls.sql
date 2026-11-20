-- Site board, part 2:
--  * selections.show_on_site — a selection can be kept off the public site QR
--    page. Defaults TRUE so codes already on site keep showing what they did.
--  * projects.site_selection_fields — which selection details that page shows
--    (null = defaults in shared/siteBoard.ts).
--  * company_settings.site_sign_* — the company's branded sign template (an
--    uploaded PDF/PNG/JPG) and the box the QR is stamped into.
--
-- Additive and idempotent. 0137 is project area.

ALTER TABLE selections ADD COLUMN IF NOT EXISTS show_on_site boolean NOT NULL DEFAULT true;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_selection_fields jsonb;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS site_sign_template_path text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS site_sign_template_name text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS site_sign_template_mime text;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS site_sign_layout jsonb;
