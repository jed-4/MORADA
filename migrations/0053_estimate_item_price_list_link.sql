-- Estimate lines remember which price list item their unit cost came from.
--
-- Purely additive: one nullable FK on estimate_items. Existing lines get NULL, which
-- reads as "not from the catalogue" — the same thing every line means today.
--
-- ON DELETE SET NULL, not CASCADE: deleting a catalogue item must never delete an
-- estimate line. The line keeps its name and its price and simply stops claiming
-- provenance.
--
-- INVARIANT enforced in application code, not here: the link is set only while
-- unit_cost_ex_tax still matches the catalogue price. Editing the cost clears the
-- link, so a drift warning can only ever mean the supplier's book moved.
--
-- No index. estimate_items is read by estimate_id (a handful of rows per estimate)
-- and filtered in memory; the reverse lookup ("which lines use catalogue item X?")
-- isn't a query path yet. Note the table already carries an index that predates
-- the drizzle table config (estimate_items_not_included_idx) — don't be surprised
-- by meta drift here.
--
-- Idempotent, safe to replay.

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS price_list_item_id varchar;

DO $$ BEGIN
  ALTER TABLE estimate_items
    ADD CONSTRAINT estimate_items_price_list_item_id_fk
    FOREIGN KEY (price_list_item_id) REFERENCES price_list_items(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
