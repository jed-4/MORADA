import { eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import * as schema from '@shared/schema';
import { db } from './db';
import { storage } from './storage';
import { unlinkAppleIdentities } from './appleAuth';

/**
 * Self-service account deletion.
 *
 * App Store guideline 5.1.1(v) requires an app that has accounts to let a
 * person delete their own from inside the app.
 *
 * What "delete" means here: the PERSON is removed and their business records
 * stay. Their login, name, email, phone, photo, linked Google/Apple identities,
 * calendar tokens, sessions and push tokens are wiped; the user row survives
 * as an anonymous "Deleted user" so the timesheets, bills, diary entries and
 * comments they authored keep a valid owner. Those records belong to the
 * company and Australian record-keeping rules expect them kept.
 *
 * Same Owner rule as archiving a team member: the only Owner of a company
 * that still has other active team members must hand ownership over first,
 * or the company would be left with nobody able to run it.
 */
export function registerAccountDeletionRoutes(app: Express) {
  app.post('/api/auth/delete-account', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) return res.status(401).json({ message: 'Not signed in' });
    if (req.body?.confirm !== true) {
      return res.status(400).json({ message: 'Confirmation required' });
    }

    try {
      const user = await storage.getUserWithRole(userId);
      if (!user || !user.isActive) {
        return res.status(404).json({ message: 'Account not found' });
      }

      if (user.userCategory === 'team' && user.companyId && user.role?.isBuiltIn && user.role.name === 'Owner') {
        const team = await storage.getUsersByCompanyWithRoles(user.companyId, 'team');
        const others = team.filter(u => u.id !== user.id && u.isActive);
        const otherOwners = others.filter(u => u.role?.isBuiltIn && u.role.name === 'Owner');
        if (others.length > 0 && otherOwners.length === 0) {
          return res.status(409).json({
            message: "You're the only Owner of your company. Make another team member an Owner on the web app before deleting your account.",
            code: 'sole_owner',
          });
        }
      }

      await db.update(schema.users).set({
        email: `deleted-${user.id}@deleted.invalid`,
        firstName: 'Deleted',
        lastName: 'user',
        phone: null,
        profileImageUrl: null,
        passwordHash: null,
        googleId: null,
        googleCalendarEmail: null,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null,
        useGmailForSending: false,
        isActive: false,
        isInvitePending: false,
        updatedAt: new Date(),
      }).where(eq(schema.users.id, user.id));

      await unlinkAppleIdentities(user.id);
      await db.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, user.id));
      await storage.deleteSessionsForUser(user.id);

      if (user.companyId) {
        try {
          await db.insert(schema.userArchiveEvents).values({
            companyId: user.companyId,
            userId: user.id,
            action: 'deleted',
            byUserId: user.id,
            byName: 'Deleted user',
          });
        } catch (err) {
          // The record is a nicety; the deletion has already happened.
          console.error('[Auth] Failed to record account deletion event:', err);
        }
      }

      console.log(`[Auth] Account deleted by its owner: ${user.id}`);
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ deleted: true });
      });
    } catch (error) {
      console.error('[Auth] Account deletion error:', error);
      res.status(500).json({ message: 'Failed to delete account' });
    }
  });
}
