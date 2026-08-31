-- Client Review & Approvals — PR1 (schema only).
--
-- A builder pushes documents to a reviewer; the reviewer approves, asks for
-- changes, or rejects; asking for changes cycles into a new revision. Every
-- revision, comment and decision is retained.
--
-- Additive only: five new tables and two new enums. NOTHING existing is
-- altered, so this cannot conflict with any in-flight migration and needs no
-- backfill. Safe to run on a live database.
--
-- The reviewer is deliberately generic (reviewer_type + one of two refs), so
-- phase 2 (internal user-to-user review) needs no further migration.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE review_cost_impact AS ENUM ('none', 'possible', 'confirmed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_decision AS ENUM ('approved', 'changes_requested', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── review_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_items (
  id                          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id                  VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id                  VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  name                        TEXT NOT NULL,
  description                 TEXT,
  -- draft | awaiting_review | changes_requested | approved | rejected | closed
  status                      TEXT NOT NULL DEFAULT 'draft',
  due_date                    TIMESTAMP,

  -- Cost impact: ONE field, three states.
  cost_impact                 review_cost_impact NOT NULL DEFAULT 'none',
  -- Estimated impact, prompted (optional) when cost_impact = 'confirmed'.
  cost_impact_estimate_mode   TEXT,            -- amount | range | tbc | NULL
  cost_impact_amount_cents    INTEGER,
  cost_impact_min_cents       INTEGER,
  cost_impact_max_cents       INTEGER,
  cost_impact_note            TEXT,

  -- Opt-in downstream hook (implemented in PR5). Not derivable from
  -- cost_impact: the composer auto-ticks it for 'confirmed', but the builder
  -- can override either way.
  create_variation_on_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- FK added after review_revisions exists (mutual reference).
  current_revision_id         VARCHAR,

  -- Reviewer. 'client' in V1; phase 2 sets 'user' + reviewer_user_id.
  reviewer_type               TEXT NOT NULL DEFAULT 'client',
  reviewer_contact_id         VARCHAR REFERENCES contacts(id) ON DELETE SET NULL,
  reviewer_user_id            VARCHAR REFERENCES users(id) ON DELETE SET NULL,

  -- Direct-link access. One token per item, lazily minted, stable across
  -- revisions — same model as selections.portal_token / variations.portal_token.
  portal_token                VARCHAR UNIQUE,
  portal_sent_at              TIMESTAMP,
  portal_viewed_at            TIMESTAMP,

  created_by_id               VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  closed_at                   TIMESTAMP,
  created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_items_company_idx
  ON review_items (company_id);
CREATE INDEX IF NOT EXISTS review_items_project_status_idx
  ON review_items (project_id, status);
CREATE INDEX IF NOT EXISTS review_items_due_date_idx
  ON review_items (due_date);
CREATE INDEX IF NOT EXISTS review_items_reviewer_contact_idx
  ON review_items (reviewer_contact_id);

-- ── review_revisions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_revisions (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id  VARCHAR NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,

  revision_number INTEGER NOT NULL,
  -- Stored, not derived: relabelling the scheme must never rewrite history.
  revision_label  TEXT NOT NULL,
  -- Client-visible covering note. Internal chatter goes in review_comments
  -- with is_internal = TRUE.
  notes           TEXT,

  issued_by_id    VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  issued_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  superseded_at   TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_revisions_item_idx
  ON review_revisions (review_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS review_revisions_item_number_unique
  ON review_revisions (review_item_id, revision_number);

-- Mutual reference, added now that both tables exist. SET NULL rather than
-- CASCADE: losing a revision must not delete the item it belonged to.
DO $$ BEGIN
  ALTER TABLE review_items
    ADD CONSTRAINT review_items_current_revision_fk
    FOREIGN KEY (current_revision_id) REFERENCES review_revisions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── review_documents ────────────────────────────────────────────────────────
-- Attached to a REVISION, so each revision carries exactly what the reviewer
-- saw at the time. file_path is an object-storage path
-- (/objects/company/<cid>/uploads/<uuid>) — NOT a Google Drive pointer, which a
-- reviewer on a token link could not open.
CREATE TABLE IF NOT EXISTS review_documents (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised so listing an item's documents needs no join.
  review_item_id  VARCHAR NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  revision_id     VARCHAR NOT NULL REFERENCES review_revisions(id) ON DELETE CASCADE,

  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_type       TEXT,
  mime_type       TEXT,
  file_size       INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- V1 is team-upload only; there is no client upload route.
  uploaded_by_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_documents_revision_idx
  ON review_documents (revision_id);
CREATE INDEX IF NOT EXISTS review_documents_item_idx
  ON review_documents (review_item_id);

-- ── review_comments ─────────────────────────────────────────────────────────
-- One level of threading. is_internal rows are builder-only and are stripped
-- from every reviewer-facing projection server-side.
CREATE TABLE IF NOT EXISTS review_comments (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id        VARCHAR NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  -- SET NULL: deleting a revision must not delete the conversation about it.
  revision_id           VARCHAR REFERENCES review_revisions(id) ON DELETE SET NULL,
  parent_comment_id     VARCHAR REFERENCES review_comments(id) ON DELETE SET NULL,

  content               TEXT NOT NULL,
  attachment_urls       TEXT[] NOT NULL DEFAULT '{}',
  attachment_file_names TEXT[] NOT NULL DEFAULT '{}',

  author_type           TEXT NOT NULL DEFAULT 'team',  -- team | client | system
  created_by_id         VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_by_name       TEXT NOT NULL,

  is_internal           BOOLEAN NOT NULL DEFAULT FALSE,
  is_system             BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  edited_at             TIMESTAMP
);

CREATE INDEX IF NOT EXISTS review_comments_item_created_idx
  ON review_comments (review_item_id, created_at);
CREATE INDEX IF NOT EXISTS review_comments_parent_idx
  ON review_comments (parent_comment_id);

-- ── review_approvals ────────────────────────────────────────────────────────
-- APPEND-ONLY. Never UPDATEd.
--
-- The snapshot columns are the point: the cost-impact state AND the exact
-- banner wording shown at decision time are frozen here, so rewording the copy
-- later cannot change what a historic approval says the client agreed to. Same
-- freeze-on-event pattern as projects.contracted_total_*.
CREATE TABLE IF NOT EXISTS review_approvals (
  id                               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id                   VARCHAR NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  revision_id                      VARCHAR NOT NULL REFERENCES review_revisions(id) ON DELETE CASCADE,

  decision                         review_decision NOT NULL,
  comment                          TEXT,

  -- Frozen at decision time.
  snapshot_cost_impact             review_cost_impact NOT NULL,
  snapshot_banner_text             TEXT,   -- NULL when the impact was 'none'
  snapshot_banner_version          TEXT,
  snapshot_estimate_mode           TEXT,
  snapshot_estimate_amount_cents   INTEGER,
  snapshot_estimate_min_cents      INTEGER,
  snapshot_estimate_max_cents      INTEGER,
  snapshot_estimate_note           TEXT,

  -- Red gate: 'confirmed' items cannot be approved until this is ticked.
  -- Enforced server-side; persisted so the trail proves it was shown.
  acknowledged_variation_required  BOOLEAN NOT NULL DEFAULT FALSE,

  decided_by_type                  TEXT NOT NULL DEFAULT 'client',       -- client | user
  decided_by_user_id               VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  decided_by_contact_id            VARCHAR REFERENCES contacts(id) ON DELETE SET NULL,
  decided_by_name                  TEXT NOT NULL,
  decided_via                      TEXT NOT NULL DEFAULT 'portal_login', -- portal_login | portal_token
  decided_ip                       TEXT,
  decided_user_agent               TEXT,

  -- Set by the PR5 hook when this approval raised a draft variation. Also the
  -- idempotency guard: already set means do not raise a second one.
  created_variation_id             VARCHAR REFERENCES variations(id) ON DELETE SET NULL,

  created_at                       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_approvals_item_created_idx
  ON review_approvals (review_item_id, created_at);
CREATE INDEX IF NOT EXISTS review_approvals_revision_idx
  ON review_approvals (revision_id);
CREATE INDEX IF NOT EXISTS review_approvals_variation_idx
  ON review_approvals (created_variation_id);
