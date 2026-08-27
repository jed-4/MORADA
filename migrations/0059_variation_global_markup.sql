-- Variations: a stored, document-level markup that sits alongside per-line markup.
--
-- Until now "Global markup" in the editor was not global and was not stored: it
-- was a bulk-stamp button that overwrote every line's markup_percent with one
-- number. Line markup is baked into unit_price/total_price, so the margin was
-- invisible to the client and could never be shown as its own figure.
--
-- This column is the second, independent layer. Per-line markup keeps working
-- exactly as it does (baked into the line amounts the client sees itemised);
-- this percentage applies once to the ex-GST value of everything being
-- on-charged and prints as its own row in the document's totals block.
--
-- Base is cost lines + linked bills + on-charged labour. Allowance lines are
-- excluded: they are adjustments and are frequently negative, so marking them
-- up would inflate a credit.
--
-- double precision, not integer, deliberately. Per-line markup_percent is an
-- integer and always has been, but a document-level margin is routinely a
-- fraction (12.5%, 17.5%), and an integer column here would truncate silently —
-- the same failure mode that bit the variation claim percentages.
--
-- NULL and 0 both mean "no global markup"; NULL is the default so existing
-- variations are untouched and their stored totals stay correct without a
-- backfill.
--
-- global_markup_amount is the resulting ex-GST cents, denormalised alongside
-- subtotal/gst_amount/total_amount for the same reason those are stored: the
-- client document must render the exact figure that was banked, not one it
-- recomputed on the fly and which could drift from the Total being approved.
-- Server-derived on every write; never accepted from a request body.
--
-- Safe to re-run; IF NOT EXISTS. Adding nullable/defaulted columns takes only a
-- brief metadata lock in Postgres 11+ — no table rewrite.

ALTER TABLE variations
  ADD COLUMN IF NOT EXISTS global_markup_percent double precision,
  ADD COLUMN IF NOT EXISTS global_markup_amount integer NOT NULL DEFAULT 0;
