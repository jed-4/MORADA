import { google } from 'googleapis';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import { encryptToken, decryptToken } from '../utils/encryption';
import type { IStorage } from '../storage';
import type { User } from '@shared/schema';
import { buildAppUrl } from '../config/appUrl';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

const BILL_INBOX_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
];

const userClientCache = new Map<string, { client: any; expiresAt: number }>();
const TOKEN_PERSIST_DEBOUNCE = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Signed OAuth state
//
// The bill-inbox callback is necessarily unauthenticated (Google redirects the
// browser to it), so the `state` round-trip is what tells us which company the
// consent belongs to. An unsigned state is forgeable: anyone could hand an
// admin a callback URL naming another company and bind their own Gmail account
// into that company's bill inbox. Every state we issue is therefore HMAC-signed
// and short-lived, and the callback refuses anything that doesn't verify.
// ---------------------------------------------------------------------------

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  action: string;
  companyId: string;
  userId: string;
}

function getStateSigningKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    // index.ts already refuses to boot without SESSION_SECRET in production;
    // this is a second line of defence so we never sign with a known constant.
    throw new Error('SESSION_SECRET is required to sign OAuth state');
  }
  return 'buildpro-dev-oauth-state-key';
}

function computeStateSignature(body: string): string {
  return createHmac('sha256', getStateSigningKey()).update(body).digest('base64url');
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      nonce: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
    }),
  ).toString('base64url');
  return `${body}.${computeStateSignature(body)}`;
}

/**
 * Returns the payload when the state is authentic and unexpired, otherwise
 * null. Never throws — callers are redirect handlers that must fail closed
 * without leaking why.
 */
export function verifyOAuthState(
  state: unknown,
  expectedAction: string,
): OAuthStatePayload | null {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [body, signature] = state.split('.', 2);
  if (!body || !signature) return null;

  const expected = Buffer.from(computeStateSignature(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.action !== expectedAction) return null;
    if (!parsed.companyId || !parsed.userId || !parsed.nonce || !parsed.timestamp) return null;
    if (Date.now() - parsed.timestamp > STATE_MAX_AGE_MS) return null;
    return { action: parsed.action, companyId: parsed.companyId, userId: parsed.userId };
  } catch {
    return null;
  }
}

export class GoogleOAuthService {
  private oauth2Client: any;
  
  constructor(private storage: IStorage) {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }
    
    const redirectUri = this.getRedirectUri();
    
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
  }
  
  private getRedirectUri(): string {
    // GOOGLE_CALENDAR_REDIRECT_URI still wins, so any environment that already
    // pins an explicit URI keeps it. The fallback used to be the hardcoded
    // https://buildpro4.replit.app host, which stops resolving the moment the
    // app leaves Replit; it now derives from the shared base-URL resolver.
    // Whichever value applies must also be registered as an authorised
    // redirect URI in the Google Cloud Console.
    return process.env.GOOGLE_CALENDAR_REDIRECT_URI
      || buildAppUrl('/api/google-calendar/callback');
  }
  
  generateAuthUrl(userId: string, companyId: string): string {
    // Signed, for the same reason the bill-inbox state is: the callback is
    // unauthenticated (Google redirects the browser to it) and the state is
    // the only thing saying whose account this consent belongs to. Unsigned,
    // anyone could hand a user a callback URL naming another user id and bind
    // their own Google Calendar into that account.
    const state = signOAuthState({ action: 'calendar', companyId, userId });
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent',
    });
    
    return authUrl;
  }
  
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }
  
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }
  
  parseState(state: string): { userId: string; companyId: string } {
    const verified = verifyOAuthState(state, 'calendar');
    if (!verified) {
      throw new Error('Invalid state parameter');
    }
    return { userId: verified.userId, companyId: verified.companyId };
  }
  
  async handleCallback(code: string, state: string): Promise<User> {
    const { userId } = this.parseState(state);
    console.log('[GoogleOAuth] Processing callback for user:', userId);
    
    const { tokens } = await this.oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('[GoogleOAuth] Missing tokens - access:', !!tokens.access_token, 'refresh:', !!tokens.refresh_token);
      throw new Error('Missing tokens from Google OAuth response');
    }
    
    this.oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    
    if (!email) {
      throw new Error('Unable to retrieve email from Google');
    }
    
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    
    const expiryDate = tokens.expiry_date 
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);
    
    const updatedUser = await this.storage.updateUser(userId, {
      googleCalendarEmail: email,
      googleCalendarAccessToken: encryptedAccessToken,
      googleCalendarRefreshToken: encryptedRefreshToken,
      googleCalendarTokenExpiry: expiryDate,
      googleCalendarConnectedAt: new Date(),
    });
    
    if (!updatedUser) {
      throw new Error('Failed to update user with Google Calendar tokens');
    }
    
    userClientCache.delete(userId);
    
    console.log('[GoogleOAuth] Successfully connected Google Calendar for user:', userId, 'email:', email);
    
    return updatedUser;
  }
  
  private createUserOAuth2Client(userId: string): any {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = this.getRedirectUri();
    
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    
    client.on('tokens', (tokens: any) => {
      console.log('[GoogleOAuth] Auto-refresh tokens event for user:', userId);
      
      const existing = TOKEN_PERSIST_DEBOUNCE.get(userId);
      if (existing) clearTimeout(existing);
      
      TOKEN_PERSIST_DEBOUNCE.set(userId, setTimeout(async () => {
        try {
          const updateData: any = {};
          
          if (tokens.access_token) {
            updateData.googleCalendarAccessToken = encryptToken(tokens.access_token);
          }
          if (tokens.expiry_date) {
            updateData.googleCalendarTokenExpiry = new Date(tokens.expiry_date);
          }
          if (tokens.refresh_token) {
            updateData.googleCalendarRefreshToken = encryptToken(tokens.refresh_token);
          }
          
          if (Object.keys(updateData).length > 0) {
            await this.storage.updateUser(userId, updateData);
            console.log('[GoogleOAuth] Auto-persisted refreshed tokens for user:', userId);
          }
        } catch (err: any) {
          console.error('[GoogleOAuth] Failed to persist auto-refreshed tokens:', err.message);
        }
        TOKEN_PERSIST_DEBOUNCE.delete(userId);
      }, 500));
    });
    
    return client;
  }
  
  async getCalendarClient(userId: string): Promise<any> {
    const cached = userClientCache.get(userId);
    if (cached && cached.expiresAt > Date.now() + 2 * 60 * 1000) {
      return google.calendar({ version: 'v3', auth: cached.client });
    }
    
    const user = await this.storage.getUser(userId);
    
    if (!user || !user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      throw new Error('Google Calendar not connected for this user');
    }
    
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken = decryptToken(user.googleCalendarAccessToken);
      refreshToken = decryptToken(user.googleCalendarRefreshToken);
    } catch (decryptError: any) {
      console.error('[GoogleOAuth] DECRYPTION FAILED for user:', userId, decryptError.message);
      await this.storage.updateUser(userId, {
        googleCalendarEmail: null,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null,
      });
      userClientCache.delete(userId);
      throw new Error('Google Calendar tokens corrupted. Please reconnect your calendar.');
    }
    
    const userClient = this.createUserOAuth2Client(userId);
    
    userClient.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: user.googleCalendarTokenExpiry?.getTime(),
    });
    
    const tokenExpiry = user.googleCalendarTokenExpiry?.getTime() || 0;
    // Only proactively refresh when token is actually expired or within 60 seconds.
    // A 5-minute window caused hanging refreshes when the token was still valid.
    const shouldRefresh = !user.googleCalendarTokenExpiry || 
      tokenExpiry < Date.now() + 60 * 1000;
    
    if (shouldRefresh) {
      console.log('[GoogleOAuth] Proactively refreshing token for user:', userId);
      
      const MAX_RETRIES = 2;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // 10-second timeout per refresh attempt to avoid indefinite hangs
          const refreshResult = await Promise.race([
            userClient.refreshAccessToken(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Token refresh timed out after 10s')), 10000)
            ),
          ]);
          const { credentials } = refreshResult;
          
          if (credentials.access_token) {
            const encryptedAccessToken = encryptToken(credentials.access_token);
            const expiryDate = credentials.expiry_date 
              ? new Date(credentials.expiry_date)
              : new Date(Date.now() + 3600 * 1000);
            
            await this.storage.updateUser(userId, {
              googleCalendarAccessToken: encryptedAccessToken,
              googleCalendarTokenExpiry: expiryDate,
            });
            
            userClient.setCredentials(credentials);
            
            userClientCache.set(userId, {
              client: userClient,
              expiresAt: expiryDate.getTime(),
            });
            
            console.log('[GoogleOAuth] Token refreshed on attempt', attempt, 'expires:', expiryDate);
          }
          lastError = null;
          break;
        } catch (refreshError: any) {
          lastError = refreshError;
          console.error(`[GoogleOAuth] Token refresh attempt ${attempt}/${MAX_RETRIES} failed for user:`, userId, refreshError.message);
          
          // Timeout errors — no point retrying, just fall through with existing credentials
          if (refreshError?.message?.includes('timed out')) {
            console.log('[GoogleOAuth] Refresh timed out — will use existing credentials');
            break;
          }
          
          if (this.isPermanentTokenError(refreshError)) {
            console.error('[GoogleOAuth] Permanent error - clearing tokens');
            await this.storage.updateUser(userId, {
              googleCalendarEmail: null,
              googleCalendarAccessToken: null,
              googleCalendarRefreshToken: null,
              googleCalendarTokenExpiry: null,
              googleCalendarConnectedAt: null,
            });
            userClientCache.delete(userId);
            throw new Error('Google Calendar access has been revoked. Please reconnect your calendar.');
          }
          
          if (attempt < MAX_RETRIES) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            console.log(`[GoogleOAuth] Retrying in ${backoffMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }
      
      if (lastError) {
        console.log('[GoogleOAuth] All retry attempts exhausted - keeping tokens, using existing credentials');
      }
    } else {
      userClientCache.set(userId, {
        client: userClient,
        expiresAt: tokenExpiry,
      });
    }
    
    return google.calendar({ version: 'v3', auth: userClient });
  }
  
  async disconnectCalendar(userId: string): Promise<void> {
    await this.storage.updateUser(userId, {
      googleCalendarEmail: null,
      googleCalendarAccessToken: null,
      googleCalendarRefreshToken: null,
      googleCalendarTokenExpiry: null,
      googleCalendarConnectedAt: null,
    });
    userClientCache.delete(userId);
  }
  
  private isPermanentTokenError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorDescription = error?.response?.data?.error_description?.toLowerCase() || '';
    const errorCode = error?.response?.data?.error || error?.code || '';
    
    const permanentErrorPatterns = [
      'invalid_grant',
      'token has been expired or revoked',
      'token has been revoked',
      'authorization_revoked',
    ];
    
    for (const pattern of permanentErrorPatterns) {
      if (
        errorMessage.includes(pattern) ||
        errorDescription.includes(pattern) ||
        errorCode === pattern
      ) {
        return true;
      }
    }
    
    return false;
  }
  
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    email: string | null;
    tokenExpiry: Date | null;
    isExpired: boolean;
    connectedAt: Date | null;
    health: 'healthy' | 'expiring_soon' | 'expired' | 'disconnected';
    expiresIn: number | null;
  }> {
    const user = await this.storage.getUser(userId);
    
    const hasTokens = !!(user?.googleCalendarAccessToken && user?.googleCalendarRefreshToken);
    const tokenExpiry = user?.googleCalendarTokenExpiry || null;
    const isExpired = tokenExpiry ? tokenExpiry.getTime() < Date.now() : false;
    const expiresIn = tokenExpiry ? Math.max(0, tokenExpiry.getTime() - Date.now()) : null;
    
    const getHealth = (connected: boolean, expired: boolean, expiresInMs: number | null): 'healthy' | 'expiring_soon' | 'expired' | 'disconnected' => {
      if (!connected) return 'disconnected';
      if (expired) return 'expired';
      if (expiresInMs !== null && expiresInMs < 10 * 60 * 1000) return 'expiring_soon';
      return 'healthy';
    };
    
    if (hasTokens && isExpired) {
      try {
        await this.getCalendarClient(userId);
        const refreshedUser = await this.storage.getUser(userId);
        const newExpiry = refreshedUser?.googleCalendarTokenExpiry || null;
        const newExpiresIn = newExpiry ? Math.max(0, newExpiry.getTime() - Date.now()) : null;
        return {
          connected: true,
          email: refreshedUser?.googleCalendarEmail || null,
          tokenExpiry: newExpiry,
          isExpired: false,
          connectedAt: refreshedUser?.googleCalendarConnectedAt || null,
          health: getHealth(true, false, newExpiresIn),
          expiresIn: newExpiresIn,
        };
      } catch (err: any) {
        console.log('[GoogleOAuth] Status check refresh failed:', err.message);
        const stillHasTokens = !!(
          (await this.storage.getUser(userId))?.googleCalendarAccessToken &&
          (await this.storage.getUser(userId))?.googleCalendarRefreshToken
        );
        return {
          connected: stillHasTokens,
          email: user?.googleCalendarEmail || null,
          tokenExpiry,
          isExpired: !stillHasTokens ? false : true,
          connectedAt: user?.googleCalendarConnectedAt || null,
          health: getHealth(stillHasTokens, true, expiresIn),
          expiresIn,
        };
      }
    }
    
    return {
      connected: hasTokens,
      email: user?.googleCalendarEmail || null,
      tokenExpiry,
      isExpired: hasTokens ? isExpired : false,
      connectedAt: user?.googleCalendarConnectedAt || null,
      health: getHealth(hasTokens, isExpired, expiresIn),
      expiresIn,
    };
  }
  
  generateBillInboxAuthUrl(state: string): string {
    const client = this.createBillInboxOAuth2Client();
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: BILL_INBOX_SCOPES,
      state,
      prompt: 'consent',
    });
    return authUrl;
  }

  async handleBillInboxCallback(code: string): Promise<{ email: string; accessToken: string; refreshToken: string; tokenExpiry: Date }> {
    const client = this.createBillInboxOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing tokens from Google OAuth response for bill inbox');
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      throw new Error('Unable to retrieve email from Google for bill inbox');
    }

    const expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    return {
      email,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiry: expiryDate,
    };
  }

  /**
   * The companyId is required because a successful refresh writes the new
   * access token straight back to company_settings. Without it that write went
   * through the unscoped fallback and could land a live Gmail token in another
   * company's settings row.
   */
  async getBillInboxGmailClient(settings: {
    billInboxGmailAccessToken: string;
    billInboxGmailRefreshToken: string;
    billInboxGmailTokenExpiry?: Date | null;
  }, companyId: string): Promise<any> {
    if (!companyId) {
      throw new Error('getBillInboxGmailClient requires a companyId');
    }

    let accessToken: string;
    let refreshToken: string;

    try {
      accessToken = decryptToken(settings.billInboxGmailAccessToken);
      refreshToken = decryptToken(settings.billInboxGmailRefreshToken);
    } catch (e: any) {
      throw new Error('Bill inbox Gmail tokens corrupted. Please reconnect the bill inbox account.');
    }

    const client = this.createBillInboxOAuth2Client();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: settings.billInboxGmailTokenExpiry?.getTime(),
    });

    const shouldRefresh = !settings.billInboxGmailTokenExpiry ||
      settings.billInboxGmailTokenExpiry.getTime() < Date.now() + 60 * 1000;

    if (shouldRefresh) {
      try {
        const { credentials } = await Promise.race([
          client.refreshAccessToken(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Token refresh timed out')), 10000)
          ),
        ]);
        if (credentials.access_token) {
          client.setCredentials(credentials);
          const encryptedNew = encryptToken(credentials.access_token);
          const newExpiry = credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + 3600 * 1000);
          await this.storage.updateCompanySettings({
            billInboxGmailAccessToken: encryptedNew,
            billInboxGmailTokenExpiry: newExpiry,
          }, companyId);
        }
      } catch (err: any) {
        console.log('[BillInbox] Token refresh failed, using existing credentials:', err.message);
      }
    }

    return google.gmail({ version: 'v1', auth: client });
  }

  private createBillInboxOAuth2Client(): any {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = this.getBillInboxRedirectUri();
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  getBillInboxRedirectUri(): string {
    // Was hardcoded to https://buildpro4.replit.app with no override at all,
    // which made connecting a bill inbox impossible anywhere else. Derived
    // from the shared resolver now; on Replit it produces the same host.
    return buildAppUrl('/api/bill-inbox/callback');
  }

  async getGmailClient(userId: string): Promise<any> {
    const user = await this.storage.getUser(userId);
    
    if (!user || !user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      throw new Error('Google account not connected for this user');
    }
    
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken = decryptToken(user.googleCalendarAccessToken);
      refreshToken = decryptToken(user.googleCalendarRefreshToken);
    } catch (decryptError: any) {
      console.error('[GoogleOAuth/Gmail] DECRYPTION FAILED for user:', userId);
      await this.storage.updateUser(userId, {
        googleCalendarEmail: null,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null,
      });
      userClientCache.delete(userId);
      throw new Error('Google account tokens corrupted. Please reconnect.');
    }
    
    const gmailClient = this.createUserOAuth2Client(userId);
    
    gmailClient.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: user.googleCalendarTokenExpiry?.getTime(),
    });
    
    const shouldRefresh = !user.googleCalendarTokenExpiry || 
      user.googleCalendarTokenExpiry.getTime() < Date.now() + 5 * 60 * 1000;
    
    if (shouldRefresh) {
      try {
        const { credentials } = await gmailClient.refreshAccessToken();
        
        if (credentials.access_token) {
          const encryptedAccessToken = encryptToken(credentials.access_token);
          const expiryDate = credentials.expiry_date 
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + 3600 * 1000);
          
          await this.storage.updateUser(userId, {
            googleCalendarAccessToken: encryptedAccessToken,
            googleCalendarTokenExpiry: expiryDate,
          });
          
          gmailClient.setCredentials(credentials);
        }
      } catch (refreshError: any) {
        if (this.isPermanentTokenError(refreshError)) {
          await this.storage.updateUser(userId, {
            googleCalendarEmail: null,
            googleCalendarAccessToken: null,
            googleCalendarRefreshToken: null,
            googleCalendarTokenExpiry: null,
            googleCalendarConnectedAt: null,
          });
          userClientCache.delete(userId);
          throw new Error('Google account access has been revoked. Please reconnect.');
        }
        
        console.log('[GoogleOAuth/Gmail] Temporary refresh error - using existing credentials');
      }
    }
    
    return google.gmail({ version: 'v1', auth: gmailClient });
  }
}
