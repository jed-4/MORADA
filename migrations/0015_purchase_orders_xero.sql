ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "xero_purchase_order_id" text;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "xero_purchase_order_number" text;
