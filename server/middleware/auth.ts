import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { User } from '@shared/schema';

// Extend Express Request and Session to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

/**
 * Safe user helper that removes all sensitive fields before sending to the
 * client. The User schema does not have a `password` column — credentials
 * live in `passwordHash`, plus OAuth tokens. All of these must be stripped.
 */
export type SafeUser = Omit<
  User,
  | 'passwordHash'
  | 'googleCalendarAccessToken'
  | 'googleCalendarRefreshToken'
  | 'googleCalendarTokenExpiry'
>;

export function toSafeUser(user: User): SafeUser {
  const {
    passwordHash: _ph,
    googleCalendarAccessToken: _gat,
    googleCalendarRefreshToken: _grt,
    googleCalendarTokenExpiry: _gte,
    ...safeUser
  } = user;
  return safeUser;
}

/**
 * Session-based authentication middleware
 * Validates user session and loads user data
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Check for valid session
    if (!req.session || !req.session.userId) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return;
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      // Clear invalid session
      req.session.userId = undefined;
      res.status(401).json({ error: 'Invalid or inactive user. Please log in again.' });
      return;
    }

    // Enrich roleName from the roles table when the cached column is empty.
    // This happens for users created before the role_name cache was introduced,
    // or when a role was assigned without updating the cached column.
    if (!user.roleName && user.roleId) {
      try {
        const role = await storage.getUserRole(user.roleId);
        if (role?.name) {
          (user as any).roleName = role.name;
        }
      } catch {
        // Non-fatal — proceed without roleName enrichment
      }
    }

    req.user = user;
    req.userId = req.session.userId;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Admin-only middleware - requires team user with admin role
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check if user is team member (not supplier/client)
  if (req.user.userCategory !== 'team') {
    res.status(403).json({ error: 'Admin access required - team members only' });
    return;
  }

  // Check if user has admin role
  if (!req.user.roleId) {
    res.status(403).json({ error: 'Admin role required' });
    return;
  }

  const role = await storage.getUserRole(req.user.roleId);
  if (!role || !isAdminRole(role)) {
    res.status(403).json({ error: 'Admin role required' });
    return;
  }

  next();
}

/**
 * Shared helper — returns true when the given role is considered an admin-level role
 * that should bypass per-permission checks.
 */
export function isAdminRole(role: { name?: string | null; isBuiltIn?: boolean | null }): boolean {
  const n = (role.name ?? '').toLowerCase();
  return !!(role.isBuiltIn && (
    n.includes('admin') ||
    n.includes('owner') ||
    n.includes('general manage') ||
    n === 'general manager'
  ));
}

/**
 * Role-based permission checker
 */
export function requirePermission(permissionKey: string, action: 'view' | 'add' | 'edit' | 'delete' | 'approve' | 'send' | 'convert' | 'summary_only') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Development bypass
    if (process.env.NODE_ENV === 'development') {
      next();
      return;
    }

    if (!req.user || !req.user.roleId) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    try {
      // Check if user has an admin-level role (bypass permission check for admins)
      const role = await storage.getUserRole(req.user.roleId);
      if (role && isAdminRole(role)) {
        next();
        return;
      }

      // Get role permissions
      const rolePermissions = await storage.getRolePermissions(req.user.roleId);
      
      // Find the specific permission
      for (const rp of rolePermissions) {
        const permission = await storage.getPermission(rp.permissionId);
        if (permission && permission.key === permissionKey) {
          // Type-safe check for allowed actions
          const allowedActions = Array.isArray(rp.allowedActions) ? rp.allowedActions as string[] : [];
          if (allowedActions.includes(action)) {
            next();
            return;
          }
        }
      }

      res.status(403).json({ 
        error: `Insufficient permissions: ${permissionKey}:${action} required` 
      });
    } catch (error) {
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Team member access only (excludes suppliers and clients from admin functions)
 */
export function requireTeamMember(req: Request, res: Response, next: NextFunction): void {
  // Development bypass
  if (process.env.NODE_ENV === 'development') {
    next();
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.userCategory !== 'team') {
    res.status(403).json({ error: 'Team member access required' });
    return;
  }

  next();
}