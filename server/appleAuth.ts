import { sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { db } from './db';
import { storage } from './storage';
import { verifyAppleIdentityToken, type AppleIdentity } from './appleIdentityToken';

/**
 * Sign in with Apple for the iOS app.
 *
 * App Store guideline 4.8: an app that offers a third-party login (we offer
 * Google) must also offer Sign in with Apple. This is SIGN-IN only — accounts
 * are still created on the web or by invite, so an Apple ID that maps to no
 * Morada user is refused rather than given an empty account.
 *
 * The Apple user id ("sub") lives in its own table, not a column on `users`:
 * Drizzle selects users with an explicit column list, so a database missing a
 * new users column would fail every request. A missing table here fails only
 * this route, and the table is also created on first use (migration 0112).
 */

let tableReady: Promise<void> | null = null;
function ensureAppleIdentitiesTable(): Promise<void> {
  tableReady ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS user_apple_identities (
      apple_sub varchar PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email text,
      created_at timestamp NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS user_apple_identities_user_idx ON user_apple_identities (user_id)`);
  })().catch(err => {
    tableReady = null; // let the next request try again
    throw err;
  });
  return tableReady;
}

async function userIdForAppleSub(sub: string): Promise<string | null> {
  const result = await db.execute(sql`SELECT user_id FROM user_apple_identities WHERE apple_sub = ${sub}`);
  const row = (result as any).rows?.[0];
  return row?.user_id ?? null;
}

async function linkAppleSub(sub: string, userId: string, email: string | undefined): Promise<void> {
  await db.execute(sql`
    INSERT INTO user_apple_identities (apple_sub, user_id, email)
    VALUES (${sub}, ${userId}, ${email ?? null})
    ON CONFLICT (apple_sub) DO NOTHING`);
}

/** Drop every Apple link for a user — part of account deletion. */
export async function unlinkAppleIdentities(userId: string): Promise<void> {
  await ensureAppleIdentitiesTable();
  await db.execute(sql`DELETE FROM user_apple_identities WHERE user_id = ${userId}`);
}

export function registerAppleAuthRoutes(app: Express) {
  app.post('/api/auth/apple/mobile', async (req: Request, res: Response) => {
    const { identityToken, nonce } = req.body ?? {};
    if (typeof identityToken !== 'string' || !identityToken) {
      return res.status(400).json({ message: 'Identity token is required' });
    }

    let identity: AppleIdentity;
    try {
      identity = await verifyAppleIdentityToken(identityToken, typeof nonce === 'string' ? nonce : undefined);
    } catch (err) {
      console.warn('[Auth] Apple token rejected:', (err as Error).message);
      return res.status(401).json({ message: 'Apple sign-in could not be verified' });
    }

    try {
      await ensureAppleIdentitiesTable();

      let userId = await userIdForAppleSub(identity.sub);
      // First Apple sign-in for this person: link it to their existing account
      // by email — but only an address Apple has verified and that isn't a
      // relay address (a relay address can't match anything we hold).
      if (!userId && identity.email && identity.emailVerified && !identity.isPrivateEmail) {
        const byEmail = await storage.getUserByEmail(identity.email);
        if (byEmail) {
          await linkAppleSub(identity.sub, byEmail.id, identity.email);
          userId = byEmail.id;
          console.log(`[Auth] Linked Apple ID to existing user: ${identity.email}`);
        }
      }

      if (!userId) {
        return res.status(404).json({
          message: identity.isPrivateEmail
            ? "We couldn't match a Morada account because you chose to hide your email. Sign in with your email and password or Google instead."
            : 'No Morada account uses this Apple ID. Ask your builder for an invite, or sign in with your email and password.',
          code: 'no_account',
        });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: 'This account has been disabled. Please contact your builder or administrator.' });
      }

      await storage.updateUserLastLogin(user.id);
      (req.session as any).userId = user.id;
      (req.session as any).companyId = user.companyId;
      (req.session as any).roleId = user.roleId;

      req.session.save((err) => {
        if (err) {
          console.error('[Auth] Apple session save error:', err);
          return res.status(500).json({ message: 'Session failed' });
        }
        console.log(`[Auth] Mobile Apple login successful: ${user.email}`);
        res.json({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            companyId: user.companyId,
          },
          sessionId: req.sessionID,
        });
      });
    } catch (error) {
      console.error('[Auth] Mobile Apple auth error:', error);
      res.status(500).json({ message: 'Apple sign-in failed' });
    }
  });
}
