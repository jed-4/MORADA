import bcrypt from 'bcrypt';
import session from 'express-session';
import type { Express, RequestHandler, Request, Response, NextFunction } from 'express';
import connectPg from 'connect-pg-simple';
import { storage } from './storage';
import { OAuth2Client } from 'google-auth-library';

const SALT_ROUNDS = 12;

function generateOAuthState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export const sessionMiddleware = (() => {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required for secure session management');
  }
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: 'sessions',
  });

  const isProduction = process.env.NODE_ENV === 'production';
  
  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: true,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge: sessionTtl,
    },
  });
})();

export async function setupAuth(app: Express) {
  app.set('trust proxy', 1);
  app.use(sessionMiddleware);

  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  
  console.log('[Auth] Custom authentication initialized');
  console.log('[Auth] Google OAuth:', googleClientId ? 'configured' : 'not configured');

  // Email/password registration
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: 'An account with this email already exists' });
      }

      // Hash password and create user
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await storage.createUser({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).companyId = user.companyId;
      (req.session as any).roleId = user.roleId;

      req.session.save((err) => {
        if (err) {
          console.error('[Auth] Session save error:', err);
          return res.status(500).json({ message: 'Failed to create session' });
        }
        console.log(`✅ [Auth] User registered: ${user.email}`);
        res.json({ user: sanitizeUser(user) });
      });
    } catch (error) {
      console.error('[Auth] Registration error:', error);
      res.status(500).json({ message: 'Registration failed' });
    }
  });

  // Email/password login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Check password
      if (!user.passwordHash) {
        return res.status(401).json({ 
          message: 'This account uses Google login. Please sign in with Google.' 
        });
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).companyId = user.companyId;
      (req.session as any).roleId = user.roleId;

      req.session.save((err) => {
        if (err) {
          console.error('[Auth] Session save error:', err);
          return res.status(500).json({ message: 'Failed to create session' });
        }
        console.log(`✅ [Auth] User logged in: ${user.email}`);
        res.json({ user: sanitizeUser(user) });
      });
    } catch (error) {
      console.error('[Auth] Login error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  // Google OAuth - initiate flow
  app.get('/api/auth/google', (req: Request, res: Response) => {
    if (!googleClientId || !googleClientSecret) {
      return res.status(500).json({ message: 'Google OAuth not configured' });
    }

    // Use https in production (behind proxy) or respect x-forwarded-proto header
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const redirectUri = `${protocol}://${req.get('host')}/api/auth/google/callback`;
    console.log('[Auth] Google OAuth redirect URI:', redirectUri);
    const oauth2Client = new OAuth2Client(googleClientId, googleClientSecret, redirectUri);

    // Generate and store CSRF state token
    const state = generateOAuthState();
    (req.session as any).oauthState = state;

    // Store redirect path in session
    const redirectTo = req.query.redirect as string;
    if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      (req.session as any).authRedirect = redirectTo;
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'consent',
      state,
    });

    req.session.save((err) => {
      if (err) {
        console.error('[Auth] Session save error:', err);
      }
      res.redirect(authUrl);
    });
  });

  // Google OAuth callback
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    try {
      const { code, error, state } = req.query;

      if (error) {
        console.error('[Auth] Google OAuth error:', error);
        return res.redirect('/auth?error=google_auth_failed');
      }

      // Verify CSRF state token
      const storedState = (req.session as any).oauthState;
      if (!state || !storedState || state !== storedState) {
        console.error('[Auth] OAuth state mismatch - possible CSRF attack');
        return res.redirect('/auth?error=invalid_state');
      }
      // Clear the state after verification
      delete (req.session as any).oauthState;

      if (!code || typeof code !== 'string') {
        return res.redirect('/auth?error=no_code');
      }

      if (!googleClientId || !googleClientSecret) {
        return res.redirect('/auth?error=not_configured');
      }

      // Use https in production (behind proxy) or respect x-forwarded-proto header
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const redirectUri = `${protocol}://${req.get('host')}/api/auth/google/callback`;
      const oauth2Client = new OAuth2Client(googleClientId, googleClientSecret, redirectUri);

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Get user info
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.redirect('/auth?error=invalid_token');
      }

      const googleId = payload.sub;
      const email = payload.email;
      const firstName = payload.given_name || payload.name?.split(' ')[0];
      const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ');
      const profileImageUrl = payload.picture;

      console.log('[Auth] Google user info:', { googleId, email, firstName, lastName });

      // Find or create user
      let user = await storage.getUserByGoogleId(googleId);

      if (!user && email) {
        // Check if user exists by email (link Google to existing account)
        user = await storage.getUserByEmail(email);
        if (user) {
          // Link Google account to existing user
          await storage.linkGoogleAccount(user.id, googleId);
          console.log(`[Auth] Linked Google account to existing user: ${email}`);
        }
      }

      if (!user) {
        // Create new user
        user = await storage.createUser({
          email: email || null,
          googleId,
          firstName: firstName || null,
          lastName: lastName || null,
          profileImageUrl: profileImageUrl || null,
        });
        console.log(`[Auth] Created new Google user: ${email}`);
      } else {
        // Update profile image if changed
        if (profileImageUrl && profileImageUrl !== user.profileImageUrl) {
          await storage.updateUser(user.id, { profileImageUrl });
        }
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).companyId = user.companyId;
      (req.session as any).roleId = user.roleId;

      const redirectPath = (req.session as any).authRedirect || '/';
      delete (req.session as any).authRedirect;

      req.session.save((err) => {
        if (err) {
          console.error('[Auth] Session save error:', err);
          return res.redirect('/auth?error=session_failed');
        }
        console.log(`✅ [Auth] Google login successful: ${user!.email}`);
        res.redirect(redirectPath);
      });
    } catch (error) {
      console.error('[Auth] Google callback error:', error);
      res.redirect('/auth?error=callback_failed');
    }
  });

  // GET logout for convenience
  app.get('/api/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('[Auth] Logout error:', err);
      }
      res.clearCookie('connect.sid');
      res.redirect('/auth');
    });
  });
}

// Middleware to check authentication
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any).userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Attach user to request for use in routes
    (req as any).user = user;
    (req as any).userId = user.id;
    (req as any).companyId = user.companyId;
    (req as any).roleId = user.roleId;

    next();
  } catch (error) {
    console.error('[Auth] Authentication check error:', error);
    res.status(401).json({ message: 'Unauthorized' });
  }
};

// Helper to sanitize user for response (remove sensitive fields)
function sanitizeUser(user: any) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// Export session compatibility middleware for Socket.io
export const ensureLegacySessionFields: RequestHandler = (req, res, next) => {
  const userId = (req.session as any).userId;
  if (userId) {
    (req as any).userId = userId;
    (req as any).companyId = (req.session as any).companyId;
    (req as any).roleId = (req.session as any).roleId;
  }
  next();
};
