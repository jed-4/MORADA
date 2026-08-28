-- Which columns and sections a variation document shows the client.
--
-- variations.pdf_columns is the per-document choice, made in the PDF preview
-- sidebar. NULL means "no choice made here" and the company default applies —
-- distinct from an empty object, which would mean "everything hidden".
--
-- company_settings.variation_pdf_columns is the default new variations inherit,
-- so a builder who never wants clients seeing unit rates sets it once.
--
-- Shape (see shared/variationDocumentColumns.ts, which is the authority):
--   { "quantity": bool, "unitPrice": bool, "grouping": bool,
--     "bills": bool, "contractSummary": bool }
-- Unknown or missing keys resolve to visible, so a partial object read back
-- degrades to showing more rather than silently hiding a column.
--
-- Deliberately jsonb and not five booleans: the set of toggles will grow, and
-- growing it should not mean a migration each time.
--
-- NOT a security boundary on its own — it is enforced server-side in the portal
-- payload so hidden fields never reach the client, but anything the client was
-- already sent before a column was turned off stays sent.
--
-- Safe to re-run; IF NOT EXISTS. Nullable columns, no rewrite, no backfill.

ALTER TABLE variations
  ADD COLUMN IF NOT EXISTS pdf_columns jsonb;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS variation_pdf_columns jsonb;
