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
 * Safe user helper that removes all sensitive fields
 */
export function toSafeUser(user: User): Omit<User, 'password'> {
  const { password, ...safeUser } = user;
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
  const roleName = role?.name?.toLowerCase() || '';
  // Match "general manage" (catches both "general manage" and "general manager")
  const isAdmin = roleName.includes('admin') || roleName.includes('general manage') || roleName.includes('owner');
  if (!role || !isAdmin) {
    res.status(403).json({ error: 'Admin role required' });
    return;
  }

  next();
}

/**
 * Role-based permission checker
 */
export function requirePermission(permissionKey: string, action: 'view' | 'add' | 'edit' | 'delete') {
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
      const roleName = role?.name?.toLowerCase() || '';
      // Match "general manage" (catches both "general manage" and "general manager")
      const isAdminRole = roleName.includes('admin') || roleName.includes('general manage') || roleName.includes('owner');
      if (isAdminRole) {
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