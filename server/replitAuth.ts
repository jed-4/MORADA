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
  
  return session({
    secret: process.env.SESSION_SECRET || 'buildpro-secret-key-2025',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
      domain: '.replit.app'
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
          // Log critical fields for production debugging
          console.log(`[Passport Deserialize] User ${user.id}: companyId=${user.companyId}, roleId=${user.roleId}`);
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
    const hostname = req.hostname;
    const protocol = req.protocol;
    const callbackUrl = `${protocol}://${hostname}/api/callback`;
    console.log(`[OAuth Login] hostname: ${hostname}, protocol: ${protocol}, callback: ${callbackUrl}, cookie sameSite: ${isProduction ? 'lax' : 'none'}`);
    
    ensureStrategy(hostname);
    passport.authenticate(`replitauth:${hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, (err?: any) => {
      if (err) {
        console.error('[OAuth Callback] Authentication failed:', err);
        return next(err);
      }
      
      const user = (req.user as any)?.dbUser;
      console.log('✅ [OAuth Callback] LOGIN SUCCESS');
      console.log('   → Session ID:', req.sessionID);
      console.log('   → User ID:', user?.id);
      console.log('   → Company ID:', user?.companyId);
      console.log('   → Role ID:', user?.roleId);
      
      next();
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
