-- Sign in with Apple (iOS app, App Store guideline 4.8). Maps an Apple user id
-- ("sub") to a Morada user. A separate table rather than a column on users,
-- so a database that hasn't run this loses only Apple sign-in — not every
-- request (users is read on all of them). Additive; also created on first use
-- by server/appleAuth.ts.
CREATE TABLE IF NOT EXISTS user_apple_identities (
  apple_sub varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_apple_identities_user_idx ON user_apple_identities (user_id);
