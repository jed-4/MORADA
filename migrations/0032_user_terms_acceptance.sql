-- Record Terms of Service acceptance at registration. Previously the register
-- form's "I agree" checkbox was client-side only and never persisted, so there
-- was no proof of acceptance. Null on pre-existing accounts and on accounts
-- created via invitation or OAuth (which don't present the checkbox yet).
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  terms_accepted_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  terms_version text;
