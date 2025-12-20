// Replit Auth integration - see blueprint:javascript_log_in_with_replit
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

// Get canonical domain for consistent cookie domain across deploys
function getCanonicalDomain(): string | undefined {
  const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
  // Prefer .replit.app domain for production stability
  const replitAppDomain = domains.find(d => d.trim().endsWith('.replit.app'));
  if (replitAppDomain) {
    // Return just the domain without leading dot for cookie domain
    return replitAppDomain.trim();
  }
  return undefined; // Let express use request hostname in dev
}

// Export session middleware for reuse (e.g., Socket.io)
export const sessionMiddleware = (() => {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  // Use canonical domain for cookie so session persists during OAuth redirect flow
  // The callback must be able to read the session that /api/login created
  const canonicalDomain = getCanonicalDomain();
  console.log('[Session] Cookie domain:', canonicalDomain || 'auto (dev mode)');
  
  return session({
    secret: process.env.SESSION_SECRET || 'buildpro-secret-key-2025',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,  // Extend session cookie on each request - keeps active users logged in
    cookie: {
      httpOnly: true,
      secure: true,  // REQUIRED with sameSite: 'none' - browsers reject otherwise
      sameSite: 'none',  // Required for Replit iframe
      maxAge: sessionTtl,  // Match cookie lifetime to session TTL (7 days)
      // Set domain to canonical host so cookie persists during OAuth flow
      ...(canonicalDomain ? { domain: canonicalDomain } : {})
    }
  });
})();

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  // Safely map Replit claims to user fields
  const userData = {
    id: claims["sub"],
    email: claims["email"] || null,
    firstName: claims["first_name"] || claims["name"]?.split(' ')[0] || null,
    lastName: claims["last_name"] || claims["name"]?.split(' ').slice(1).join(' ') || null,
    profileImageUrl: claims["profile_image_url"] || null,
  };
  
  const user = await storage.upsertUser(userData);
  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();
  
  // Detect production for logging
  const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
  const isProduction = domains.length > 0 && domains.every(d => d.trim().endsWith('.replit.app'));
  
  // Log critical OAuth configuration at startup
  console.log('[Replit Auth Setup]', {
    replId: process.env.REPL_ID,
    domains: process.env.REPLIT_DOMAINS,
    isProduction,
    issuer: process.env.ISSUER_URL || 'https://replit.com/oidc'
  });

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const sessionData: any = {};
    updateUserSession(sessionData, tokens);
    
    // Upsert user in database and get full user record with application context
    const user = await upsertUser(tokens.claims());
    
    // Hydrate session with full user record (includes companyId, roleId, etc.)
    sessionData.dbUser = user;
    
    // CRITICAL: Store database user ID, not Replit claims.sub
    // This ensures deserializeUser can find the user in our database
    sessionData.userId = user.id;
    
    verified(null, sessionData);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((sessionData: Express.User, cb) => cb(null, sessionData));
  
  passport.deserializeUser(async (sessionData: Express.User, cb) => {
    try {
      const data = sessionData as any;
      // Refresh user data from database to get latest companyId, roleId, etc.
      // Use the stored database user ID, not the Replit claims.sub
      if (data.userId) {
        const user = await storage.getUser(data.userId);
        if (user) {
          data.dbUser = user;
          if (!user.companyId) {
            console.warn(`⚠️  [Passport Deserialize] User ${user.id} has NO companyId!`);
          }
        } else {
          console.warn(`⚠️  [Passport Deserialize] No user found for userId=${data.userId}`);
        }
      } else if (data.claims?.sub) {
        // Fallback for old sessions - try using claims.sub (Replit user ID)
        console.warn(`⚠️  [Passport Deserialize] Legacy session detected - using claims.sub=${data.claims.sub}`);
        const user = await storage.getUser(data.claims.sub);
        if (user) {
          data.dbUser = user;
          data.userId = user.id; // Upgrade session
        }
      }
      cb(null, data);
    } catch (error) {
      console.error('[Passport Deserialize] Error:', error);
      cb(error);
    }
  });

  app.get("/api/login", (req, res, next) => {
    // CRITICAL: Use canonical Replit domain for OAuth callback, not request hostname
    // Custom domains are not registered with Replit's OIDC provider and cause "invalid_interaction" errors
    const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
    const canonicalDomain = domains.find(d => d.trim().endsWith('.replit.app')) || domains[0]?.trim() || req.hostname;
    const protocol = 'https'; // Always use https for OAuth
    const callbackUrl = `${protocol}://${canonicalDomain}/api/callback`;
    
    // Store redirect URL in session for after auth
    // SECURITY: Only allow safe relative paths starting with / to prevent open redirect attacks
    const redirectTo = req.query.redirect as string;
    if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      // Validate it's a safe relative path (no protocol, no double slash)
      (req.session as any).authRedirect = redirectTo;
    }
    
    // Store the original hostname so we can redirect back after auth
    (req.session as any).originalHost = req.hostname;
    
    // Debug: Log session state before OAuth redirect
    console.log(`[OAuth Login] canonical: ${canonicalDomain}, original: ${req.hostname}, callback: ${callbackUrl}, redirect: ${redirectTo || '/'}`);
    console.log('[OAuth Login] Session debug:', {
      sessionID: req.sessionID,
      cookieHeader: req.headers.cookie?.substring(0, 100),
      sessionKeys: Object.keys(req.session || {}),
    });
    
    // Save session before redirecting to ensure state is persisted
    req.session.save((err) => {
      if (err) {
        console.error('[OAuth Login] Session save error:', err);
      }
      console.log('[OAuth Login] Session saved, proceeding with OAuth');
      
      ensureStrategy(canonicalDomain);
      passport.authenticate(`replitauth:${canonicalDomain}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });
  });

  app.get("/api/callback", (req, res, next) => {
    // Use same canonical domain logic for callback
    const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
    const canonicalDomain = domains.find(d => d.trim().endsWith('.replit.app')) || domains[0]?.trim() || req.hostname;
    
    // Log callback attempt details for debugging - include session contents
    console.log('[OAuth Callback] Received callback:', {
      canonicalDomain,
      sessionID: req.sessionID,
      hasSession: !!req.session,
      sessionKeys: Object.keys(req.session || {}),
      cookieHeader: req.headers.cookie?.substring(0, 100),
      query: Object.keys(req.query),
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
      hasError: !!req.query.error,
      errorDescription: req.query.error_description,
      // Check if PKCE state is present in session (openid-client stores it here)
      hasOidcState: !!(req.session as any)?.['oidc:replit.com'],
    });
    
    // If OAuth provider returned an error, log it
    if (req.query.error) {
      console.error('[OAuth Callback] Provider error:', {
        error: req.query.error,
        description: req.query.error_description,
      });
    }
    
    ensureStrategy(canonicalDomain);
    passport.authenticate(`replitauth:${canonicalDomain}`, {
      failureRedirect: "/api/login",
      failWithError: true, // Pass errors to our handler instead of silent redirect
    })(req, res, (err?: any) => {
      if (err) {
        console.error('[OAuth Callback] Authentication failed:', {
          error: err.message || err,
          stack: err.stack,
          code: err.code,
          oauthError: err.oauthError,
        });
        // Redirect to login on error
        return res.redirect('/api/login');
      }
      
      const user = (req.user as any)?.dbUser;
      
      // FORCE session fields to be set explicitly
      (req.session as any).userId = user?.id;
      (req.session as any).companyId = user?.companyId;
      (req.session as any).roleId = user?.roleId;
      
      // Get stored redirect URL (path only - stay on canonical domain for cookie consistency)
      const redirectPath = (req.session as any).authRedirect || '/';
      const originalHost = (req.session as any).originalHost;
      delete (req.session as any).authRedirect;
      delete (req.session as any).originalHost;
      
      // NOTE: We stay on the canonical domain after auth because that's where the cookie is valid
      // Redirecting to a different domain would lose the session
      const currentHost = req.hostname;
      
      console.log('✅ [OAuth Callback] LOGIN SUCCESS');
      console.log('   → Session ID:', req.sessionID);
      console.log('   → User ID:', user?.id);
      console.log('   → Company ID:', user?.companyId);
      console.log('   → Role ID:', user?.roleId);
      console.log('   → Original Host:', originalHost);
      console.log('   → Current Host:', currentHost);
      console.log('   → Redirect Path:', redirectPath);
      console.log('   → SESSION SET:', {
        userId: (req.session as any).userId,
        companyId: (req.session as any).companyId,
        roleId: (req.session as any).roleId,
      });
      
      // Save session explicitly before redirect
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[OAuth Callback] Session save failed:', saveErr);
          return res.redirect('/api/login');
        }
        console.log(`✅ [OAuth Callback] Session saved, redirecting to ${redirectPath}`);
        res.redirect(redirectPath);
      });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

// Compatibility bridge: sync Passport user data to legacy session fields
// This allows old routes that check req.session.userId to work with new Replit Auth
export const ensureLegacySessionFields: RequestHandler = (req, res, next) => {
  const user = req.user as any;
  
  if (req.isAuthenticated() && user?.dbUser) {
    // Populate legacy session fields for backwards compatibility
    (req.session as any).userId = user.dbUser.id;
    (req.session as any).companyId = user.dbUser.companyId;
    (req.session as any).roleId = user.dbUser.roleId;
    
    // Also ensure id, companyId and roleId are on req.user for routes that check there
    user.id = user.dbUser.id;
    user.companyId = user.dbUser.companyId;
    user.roleId = user.dbUser.roleId;
  }
  
  next();
};

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
