-- Delivery check-in against a purchase order.
--
-- Site crew record what turned up on a delivery: how many of each PO line,
-- in what condition, with the docket number and a photo of the docket. The
-- PO gets its own delivery status (none / partial / delivered / issues),
-- separate from the money status, which is untouched. The old
-- partially_received / completed PO statuses stay retired.
--
-- Additive and idempotent. Safe to run more than once.
-- 0131 is defects v2, 0132 channel emoji, 0133 project site location.

CREATE TABLE IF NOT EXISTS purchase_order_deliveries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id),
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purchase_order_id varchar NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  received_at timestamp NOT NULL DEFAULT now(),
  received_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  received_by_name text,
  docket_number text,
  notes text,
  has_issues boolean NOT NULL DEFAULT false,
  client_request_id text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_deliveries_po_idx
  ON purchase_order_deliveries (purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_deliveries_company_idx
  ON purchase_order_deliveries (company_id);
-- One check-in per phone submission, however many times the phone retries.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_deliveries_project_request_uq
  ON purchase_order_deliveries (project_id, client_request_id);

CREATE TABLE IF NOT EXISTS purchase_order_delivery_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id varchar NOT NULL REFERENCES purchase_order_deliveries(id) ON DELETE CASCADE,
  purchase_order_item_id varchar REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  description_snapshot text NOT NULL DEFAULT '',
  qty_ordered_snapshot numeric(10,2) NOT NULL DEFAULT 0,
  qty_received numeric(10,2) NOT NULL DEFAULT 0,
  condition text NOT NULL DEFAULT 'ok',
  note text,
  photo_urls json DEFAULT '[]'::json
);

CREATE INDEX IF NOT EXISTS purchase_order_delivery_items_delivery_idx
  ON purchase_order_delivery_items (delivery_id);
CREATE INDEX IF NOT EXISTS purchase_order_delivery_items_po_item_idx
  ON purchase_order_delivery_items (purchase_order_item_id);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'none';

ALTER TABLE purchase_order_attachments
  ADD COLUMN IF NOT EXISTS delivery_id varchar REFERENCES purchase_order_deliveries(id) ON DELETE CASCADE;
ALTER TABLE purchase_order_attachments
  ADD COLUMN IF NOT EXISTS kind text;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS delivery_docket_photo_required boolean NOT NULL DEFAULT true;
