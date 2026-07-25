-- Founding member programme: the first FOUNDING_MEMBER_LIMIT companies to
-- start a paid subscription lock in founding pricing — first month free and
-- Studio half price for life. Set once by the Stripe webhook; never unset.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS
  is_founding_member boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS
  founding_member_at timestamp;
