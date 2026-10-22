-- Review revisions can exist before they are issued.
--
-- Documents hang off a revision, so a draft review item — which had no
-- revision until "Issue Rev A" — had nothing to attach files to. The builder
-- had to issue the review to the client BEFORE adding the drawings, which is
-- backwards. Rev A is now created unissued alongside the item, and issuing
-- stamps it.
--
-- Additive and idempotent: widens a constraint, writes no rows, and is a no-op
-- on a database where it has already run. Existing revisions keep their
-- issued_at, so every row already in the table reads as issued, which is what
-- it is.
--
-- 🚨 issued_at IS NULL now means "not yet issued to the client". Every
-- client-facing read must exclude those rows and their documents.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'review_revisions'
      AND column_name = 'issued_at'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE review_revisions ALTER COLUMN issued_at DROP NOT NULL;
  END IF;
END $$;
