-- Variation portal sign audit trail: capture the request origin when a
-- client signs (approves/rejects) a variation through the public portal
-- link. Written only by POST /api/portal/variation/:token/sign.
ALTER TABLE variations ADD COLUMN IF NOT EXISTS
  client_signed_ip text;
ALTER TABLE variations ADD COLUMN IF NOT EXISTS
  client_signed_user_agent text;
