import { google } from 'googleapis';
import { randomBytes, createHash } from 'crypto';
import { encryptToken, decryptToken } from '../utils/encryption';
import type { IStorage } from '../storage';
import type { User } from '@shared/schema';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

const userClientCache = new Map<string, { client: any; expiresAt: number }>();
const TOKEN_PERSIST_DEBOUNCE = new Map<string, NodeJS.Timeout>();

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
    return 'https://buildpro4.replit.app/api/google-calendar/callback';
  }
  
  generateAuthUrl(userId: string): string {
    const state = this.generateState(userId);
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent',
    });
    
    return authUrl;
  }
  
  private generateState(userId: string): string {
    const nonce = randomBytes(16).toString('hex');
    return Buffer.from(JSON.stringify({ userId, nonce, timestamp: Date.now() })).toString('base64');
  }
  
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }
  
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }
  
  parseState(state: string): { userId: string; nonce: string; timestamp: number } {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      
      if (!parsed.userId || !parsed.nonce || !parsed.timestamp) {
        throw new Error('Invalid state format');
      }
      
      const age = Date.now() - parsed.timestamp;
      if (age > 10 * 60 * 1000) {
        throw new Error('State expired (older than 10 minutes)');
      }
      
      return parsed;
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
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
    const shouldRefresh = !user.googleCalendarTokenExpiry || 
      tokenExpiry < Date.now() + 5 * 60 * 1000;
    
    if (shouldRefresh) {
      console.log('[GoogleOAuth] Proactively refreshing token for user:', userId);
      
      const MAX_RETRIES = 3;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { credentials } = await userClient.refreshAccessToken();
          
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
