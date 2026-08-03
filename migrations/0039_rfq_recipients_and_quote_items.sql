-- RFQ recipients + per-line quote pricing.
--
-- A supplier's participation in an RFQ used to be smeared across three places
-- with nothing but array position tying them together: rfqs.supplier_ids[] /
-- rfqs.supplier_names[], an optional rfq_portal_tokens row, and an optional
-- rfq_quotes row. Removing a supplier matched by NAME, so two suppliers with
-- the same name desynced the arrays permanently.
--
-- rfq_recipients makes each request a row. rfq_quote_items adds the per-line
-- pricing that "compare quotes line by line" always needed and never had.
--
-- The supplier_ids/supplier_names arrays are deliberately NOT dropped here.
-- They stay as a server-maintained mirror so the PDF, send dialog and quote
-- upload dialog keep working while they are migrated off; a later change
-- removes them.

-- 1. Recipients ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE rfq_recipient_status AS ENUM (
    'not_sent', 'sent', 'viewed', 'quoted', 'declined', 'no_response'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rfq_recipients (
  id                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                   varchar NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id              varchar REFERENCES contacts(id) ON DELETE SET NULL,
  supplier_name            text NOT NULL,
  supplier_email           text,
  status                   rfq_recipient_status NOT NULL DEFAULT 'not_sent',
  is_external              boolean NOT NULL DEFAULT false,
  sent_at                  timestamp,
  viewed_at                timestamp,
  responded_at             timestamp,
  portal_token             text UNIQUE,
  portal_token_expires_at  timestamp,
  portal_token_revoked     boolean NOT NULL DEFAULT false,
  quote_id                 varchar,
  last_reminded_at         timestamp,
  reminders_sent           integer NOT NULL DEFAULT 0,
  notes                    text,
  display_order            integer NOT NULL DEFAULT 0,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_recipients_rfq_id_idx ON rfq_recipients (rfq_id);

-- A supplier can only appear once per RFQ. Partial, because supplier_id is
-- null for ad-hoc recipients who aren't in Contacts yet.
CREATE UNIQUE INDEX IF NOT EXISTS rfq_recipients_rfq_supplier_unique
  ON rfq_recipients (rfq_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

-- 2. Backfill from the parallel arrays -------------------------------------
-- unnest WITH ORDINALITY pairs the two arrays by position, which is exactly the
-- coupling that made them fragile — but it is the only information there is, so
-- it is also the only correct way to read them one last time. Blank ids become
-- NULL (the arrays used "" as a placeholder).
INSERT INTO rfq_recipients (rfq_id, supplier_id, supplier_name, display_order, created_at, updated_at)
SELECT r.id,
       NULLIF(s.supplier_id, ''),
       COALESCE(NULLIF(s.supplier_name, ''), 'Unknown supplier'),
       s.ord - 1,
       r.created_at,
       r.created_at
FROM rfqs r
CROSS JOIN LATERAL (
  SELECT sid AS supplier_id, sname AS supplier_name, ord
  FROM unnest(r.supplier_names) WITH ORDINALITY AS n(sname, ord)
  LEFT JOIN LATERAL (
    SELECT i AS sid
    FROM unnest(r.supplier_ids) WITH ORDINALITY AS d(i, dord)
    WHERE d.dord = n.ord
  ) ids ON true
) s
WHERE NOT EXISTS (SELECT 1 FROM rfq_recipients x WHERE x.rfq_id = r.id);

-- 3. Absorb existing portal tokens -----------------------------------------
-- Match on supplier_id where there is one; these rows are rare (nothing in the
-- app ever created a token), so an unmatched token is simply left behind in
-- rfq_portal_tokens rather than inventing a recipient for it.
UPDATE rfq_recipients rec
SET portal_token = t.token,
    portal_token_expires_at = t.expires_at,
    portal_token_revoked = NOT COALESCE(t.is_active, true),
    viewed_at = COALESCE(rec.viewed_at, t.viewed_at),
    supplier_email = COALESCE(rec.supplier_email, t.supplier_email)
FROM rfq_portal_tokens t
WHERE t.rfq_id = rec.rfq_id
  AND t.supplier_id IS NOT NULL
  AND t.supplier_id = rec.supplier_id
  AND rec.portal_token IS NULL;

-- 4. Seed recipient state from what already happened ------------------------
-- An RFQ that was marked sent (or that has a sentAt) had its suppliers
-- contacted, even though the old code could never persist that status.
UPDATE rfq_recipients rec
SET status = 'sent', sent_at = COALESCE(rec.sent_at, r.sent_at)
FROM rfqs r
WHERE r.id = rec.rfq_id
  AND rec.status = 'not_sent'
  AND (r.sent_at IS NOT NULL OR r.status <> 'draft');

-- Suppliers who already returned a quote.
UPDATE rfq_recipients rec
SET status = CASE WHEN q.status = 'declined' THEN 'declined'::rfq_recipient_status
                  ELSE 'quoted'::rfq_recipient_status END,
    quote_id = q.id,
    responded_at = COALESCE(rec.responded_at, q.submitted_at, q.created_at)
FROM rfq_quotes q
WHERE q.rfq_id = rec.rfq_id
  AND (
    (q.supplier_id IS NOT NULL AND q.supplier_id = rec.supplier_id)
    OR (q.supplier_id IS NULL AND lower(trim(q.supplier_name)) = lower(trim(rec.supplier_name)))
  );

-- 5. Per-line quote pricing -------------------------------------------------
CREATE TABLE IF NOT EXISTS rfq_quote_items (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       varchar NOT NULL REFERENCES rfq_quotes(id) ON DELETE CASCADE,
  rfq_item_id    varchar REFERENCES rfq_items(id) ON DELETE SET NULL,
  description    text NOT NULL,
  quantity       numeric(10,2),
  unit           text,
  unit_price     integer,
  line_total     integer,
  notes          text,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_quote_items_quote_id_idx ON rfq_quote_items (quote_id);
