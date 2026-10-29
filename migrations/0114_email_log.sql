-- The email log: enough on each email_deliveries row to show exactly what was
-- sent, where it belongs, and what the recipient did with it.
--
-- 0074 recorded THAT an email went out. It kept no copy of the message, no
-- attachment, no project — so "we never got that variation" could be answered
-- with a timestamp and nothing else. Additive only; every column is nullable or
-- defaulted, so code that predates this keeps writing rows.

ALTER TABLE email_deliveries
  -- Where it belongs. Resolved at write time from context_type/context_id.
  ADD COLUMN IF NOT EXISTS project_id        varchar,

  -- The message as it went out.
  ADD COLUMN IF NOT EXISTS from_address      text,
  ADD COLUMN IF NOT EXISTS reply_to          text,
  ADD COLUMN IF NOT EXISTS html_body         text,
  -- True when the body was deliberately not kept: password resets and invites
  -- carry a live sign-in link, and a log that any admin can read must not
  -- become a way into someone else's account.
  ADD COLUMN IF NOT EXISTS body_redacted     boolean NOT NULL DEFAULT false,
  -- [{ filename, contentType, size, objectPath }] — objectPath is null when the
  -- bytes could not be kept (no company to scope the upload to, or too large).
  ADD COLUMN IF NOT EXISTS attachments       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Engagement, from Resend's open/click tracking. Opens are approximate —
  -- Apple Mail fetches every image on arrival — so they never move `status`.
  ADD COLUMN IF NOT EXISTS delivered_at      timestamp,
  ADD COLUMN IF NOT EXISTS first_opened_at   timestamp,
  ADD COLUMN IF NOT EXISTS last_opened_at    timestamp,
  ADD COLUMN IF NOT EXISTS open_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_clicked_at  timestamp,
  ADD COLUMN IF NOT EXISTS click_count       integer NOT NULL DEFAULT 0,

  -- When the sender was told it bounced, so a retried webhook cannot notify twice.
  ADD COLUMN IF NOT EXISTS sender_notified_at timestamp,
  -- Set on a "fix and resend" copy; points at the row it replaced.
  ADD COLUMN IF NOT EXISTS resent_from_id    varchar;

CREATE INDEX IF NOT EXISTS email_deliveries_project_idx
  ON email_deliveries (company_id, project_id, sent_at DESC);

-- "Has this address bounced before?" and a contact's email history.
CREATE INDEX IF NOT EXISTS email_deliveries_to_idx
  ON email_deliveries USING gin (to_addresses);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Rows written with no company (reminders, some schedulers) take the sender's.
-- Without this they are visible to nobody.
UPDATE email_deliveries d
   SET company_id = u.company_id
  FROM users u
 WHERE d.company_id IS NULL
   AND d.user_id = u.id
   AND u.company_id IS NOT NULL;

-- Project, from the document each email was about. Same mapping as
-- projectIdSqlForContext in server/utils/email.ts.
UPDATE email_deliveries d SET project_id = x.project_id FROM variations x
 WHERE d.project_id IS NULL AND d.context_type IN ('variation', 'client_decision') AND x.id = d.context_id;
UPDATE email_deliveries d SET project_id = x.project_id FROM proposals x
 WHERE d.project_id IS NULL AND d.context_type IN ('proposal', 'proposal_reminder') AND x.id = d.context_id;
UPDATE email_deliveries d SET project_id = x.project_id FROM rfqs x
 WHERE d.project_id IS NULL AND d.context_type IN ('rfq', 'rfq_reminder') AND x.id = d.context_id;
UPDATE email_deliveries d SET project_id = x.project_id FROM purchase_orders x
 WHERE d.project_id IS NULL AND d.context_type = 'purchase_order' AND x.id = d.context_id;
UPDATE email_deliveries d SET project_id = x.project_id FROM client_invoices x
 WHERE d.project_id IS NULL AND d.context_type = 'client_invoice' AND x.id = d.context_id;
UPDATE email_deliveries d SET project_id = x.project_id FROM selections x
 WHERE d.project_id IS NULL AND d.context_type = 'selection' AND x.id = d.context_id;
UPDATE email_deliveries d SET project_id = x.project_id FROM review_items x
 WHERE d.project_id IS NULL AND d.context_type = 'review_item' AND x.id = d.context_id;

UPDATE email_deliveries
   SET delivered_at = status_updated_at
 WHERE status = 'delivered' AND delivered_at IS NULL;

-- Old rows have no body; say why for the ones that never would have had one.
UPDATE email_deliveries
   SET body_redacted = true
 WHERE context_type IN ('password_reset', 'team_invite', 'client_portal_invite');
