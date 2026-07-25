-- Manual rounding adjustment (cents) on bills, applied to the total so it can be
-- nudged to match the figure printed on the supplier invoice (like Xero's
-- "Rounding" line). Bounded to a few cents in application code.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "rounding_cents" integer NOT NULL DEFAULT 0;
