-- Trades accept purchase orders from an emailed link (replaces the old
-- signing flow, which never worked). Acceptances are stored in
-- purchase_order_signatures and the PO moves to status 'accepted'.
--
-- Both already exist on dev, created long ago by db:push, but neither is in
-- any migration file. This makes sure prod has them. Safe to run twice and
-- changes nothing where they already exist.

ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'accepted';

CREATE TABLE IF NOT EXISTS purchase_order_signatures (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   varchar NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  signer_name         text NOT NULL,
  signer_email        text,
  signer_role         text,
  signature_image_url text,
  signed_at           timestamp NOT NULL,
  ip_address          text,
  user_agent          text,
  signature_token     text UNIQUE,
  token_expires_at    timestamp,
  created_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_signatures_po_idx
  ON purchase_order_signatures (purchase_order_id);
