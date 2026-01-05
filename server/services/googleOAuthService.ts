import { google } from 'googleapis';
import { randomBytes, createHash } from 'crypto';
import { encryptToken, decryptToken } from '../utils/encryption';
import type { IStorage } from '../storage';
import type { User } from '@shared/schema';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  // 'https://www.googleapis.com/auth/gmail.send', // Temporarily disabled - requires Google verification
];

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
    // Always use production URL for OAuth callbacks since it's verified with Google
    // The tokens are stored in the database so they work across all environments
    return 'https://buildpro4.replit.app/api/google-calendar/callback';
  }
  
  generateAuthUrl(userId: string): string {
    const state = this.generateState(userId);
    
    console.log('🔍 [OAuth] Generating auth URL for user:', userId);
    console.log('🔍 [OAuth] Client ID:', process.env.GOOGLE_OAUTH_CLIENT_ID?.substring(0, 20) + '...');
    console.log('🔍 [OAuth] Redirect URI:', this.getRedirectUri());
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent',
    });
    
    console.log('🔍 [OAuth] Generated auth URL:', authUrl.substring(0, 150) + '...');
    
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
    
    console.log('[GoogleOAuth] Received tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    });
    
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
    
    console.log('[GoogleOAuth] Encrypting and storing tokens for:', email);
    
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
    
    console.log('[GoogleOAuth] Successfully connected Google Calendar for user:', userId, 'email:', email);
    
    return updatedUser;
  }
  
  async getCalendarClient(userId: string): Promise<any> {
    const user = await this.storage.getUser(userId);
    
    if (!user || !user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      console.log('[GoogleOAuth] No tokens found for user:', userId);
      throw new Error('Google Calendar not connected for this user');
    }
    
    console.log('[GoogleOAuth] Attempting to decrypt tokens for user:', userId);
    
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken = decryptToken(user.googleCalendarAccessToken);
      refreshToken = decryptToken(user.googleCalendarRefreshToken);
      console.log('[GoogleOAuth] Token decryption successful');
    } catch (decryptError: any) {
      console.error('[GoogleOAuth] DECRYPTION FAILED for user:', userId);
      console.error('[GoogleOAuth] Error:', decryptError.message);
      console.error('[GoogleOAuth] Clearing corrupted tokens - user will need to reconnect');
      await this.storage.updateUser(userId, {
        googleCalendarEmail: null,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null,
      });
      throw new Error('Google Calendar tokens corrupted. Please reconnect your calendar.');
    }
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: user.googleCalendarTokenExpiry?.getTime(),
    });
    
    const tokenExpiry = user.googleCalendarTokenExpiry?.getTime() || 0;
    const shouldRefresh = !user.googleCalendarTokenExpiry || 
      tokenExpiry < Date.now() + 5 * 60 * 1000;
    
    console.log('[GoogleOAuth] Token status:', {
      userId,
      tokenExpiry: user.googleCalendarTokenExpiry,
      expiresIn: tokenExpiry ? Math.round((tokenExpiry - Date.now()) / 1000 / 60) + ' minutes' : 'unknown',
      shouldRefresh,
    });
    
    if (shouldRefresh) {
      console.log('[GoogleOAuth] Attempting token refresh for user:', userId);
      
      const maxRetries = 3;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { credentials } = await this.oauth2Client.refreshAccessToken();
          console.log('[GoogleOAuth] Token refresh successful on attempt', attempt);
          
          if (credentials.access_token) {
            const encryptedAccessToken = encryptToken(credentials.access_token);
            const expiryDate = credentials.expiry_date 
              ? new Date(credentials.expiry_date)
              : new Date(Date.now() + 3600 * 1000);
            
            await this.storage.updateUser(userId, {
              googleCalendarAccessToken: encryptedAccessToken,
              googleCalendarTokenExpiry: expiryDate,
            });
            
            console.log('[GoogleOAuth] New token saved, expires:', expiryDate);
            this.oauth2Client.setCredentials(credentials);
          }
          lastError = null;
          break;
        } catch (refreshError: any) {
          lastError = refreshError;
          console.error(`[GoogleOAuth] TOKEN REFRESH FAILED (attempt ${attempt}/${maxRetries}) for user:`, userId);
          console.error('[GoogleOAuth] Error name:', refreshError.name);
          console.error('[GoogleOAuth] Error message:', refreshError.message);
          console.error('[GoogleOAuth] Error code:', refreshError.code);
          
          // Check if this is a permanent error that means the token is truly invalid
          const isPermanentError = this.isPermanentTokenError(refreshError);
          
          if (isPermanentError) {
            console.error('[GoogleOAuth] Permanent error detected - token has been revoked or is invalid');
            await this.storage.updateUser(userId, {
              googleCalendarEmail: null,
              googleCalendarAccessToken: null,
              googleCalendarRefreshToken: null,
              googleCalendarTokenExpiry: null,
              googleCalendarConnectedAt: null,
            });
            throw new Error('Google Calendar access has been revoked. Please reconnect your calendar.');
          }
          
          // For temporary errors, wait before retrying (but not on last attempt)
          if (attempt < maxRetries) {
            console.log(`[GoogleOAuth] Temporary error, retrying in ${attempt * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }
      
      // If we exhausted retries but it wasn't a permanent error, don't disconnect
      // Just throw an error so the user knows there's an issue, but they can try again
      if (lastError) {
        console.error('[GoogleOAuth] Token refresh failed after all retries, but keeping tokens for retry');
        console.error('[GoogleOAuth] Full error:', JSON.stringify(lastError, null, 2));
        throw new Error('Unable to refresh Google Calendar connection. Please try again in a moment.');
      }
    }
    
    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }
  
  async disconnectCalendar(userId: string): Promise<void> {
    await this.storage.updateUser(userId, {
      googleCalendarEmail: null,
      googleCalendarAccessToken: null,
      googleCalendarRefreshToken: null,
      googleCalendarTokenExpiry: null,
      googleCalendarConnectedAt: null,
    });
  }
  
  /**
   * Check if a token refresh error is permanent (requires reconnection)
   * or temporary (can be retried)
   */
  private isPermanentTokenError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorDescription = error?.response?.data?.error_description?.toLowerCase() || '';
    const errorCode = error?.response?.data?.error || error?.code || '';
    
    // These error codes/messages indicate the token is permanently invalid
    const permanentErrorPatterns = [
      'invalid_grant',           // Token has been revoked or expired permanently
      'invalid_token',           // Token is invalid
      'token has been expired or revoked',
      'token has been revoked',
      'authorization_revoked',
      'access_denied',
      'invalid_client',          // Client credentials are wrong
      'unauthorized_client',
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
    
    // Check HTTP status codes that indicate permanent failure
    const status = error?.response?.status || error?.status;
    if (status === 401 || status === 403) {
      // 401/403 with specific error codes are permanent
      if (permanentErrorPatterns.includes(errorCode)) {
        return true;
      }
    }
    
    // All other errors are considered temporary (network issues, rate limits, etc.)
    return false;
  }
  
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    email: string | null;
    tokenExpiry: Date | null;
    isExpired: boolean;
    connectedAt: Date | null;
  }> {
    const user = await this.storage.getUser(userId);
    
    const hasTokens = !!(user?.googleCalendarAccessToken && user?.googleCalendarRefreshToken);
    const tokenExpiry = user?.googleCalendarTokenExpiry || null;
    const isExpired = tokenExpiry ? tokenExpiry.getTime() < Date.now() : false;
    
    return {
      connected: hasTokens,
      email: user?.googleCalendarEmail || null,
      tokenExpiry,
      isExpired,
      connectedAt: user?.googleCalendarConnectedAt || null,
    };
  }
  
  async getGmailClient(userId: string): Promise<any> {
    const user = await this.storage.getUser(userId);
    
    if (!user || !user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      console.log('[GoogleOAuth/Gmail] No tokens found for user:', userId);
      throw new Error('Google account not connected for this user');
    }
    
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken = decryptToken(user.googleCalendarAccessToken);
      refreshToken = decryptToken(user.googleCalendarRefreshToken);
    } catch (decryptError: any) {
      console.error('[GoogleOAuth/Gmail] DECRYPTION FAILED for user:', userId);
      console.error('[GoogleOAuth/Gmail] Error:', decryptError.message);
      await this.storage.updateUser(userId, {
        googleCalendarEmail: null,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null,
      });
      throw new Error('Google account tokens corrupted. Please reconnect.');
    }
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: user.googleCalendarTokenExpiry?.getTime(),
    });
    
    const shouldRefresh = !user.googleCalendarTokenExpiry || 
      user.googleCalendarTokenExpiry.getTime() < Date.now() + 5 * 60 * 1000;
    
    if (shouldRefresh) {
      console.log('[GoogleOAuth/Gmail] Attempting token refresh for user:', userId);
      
      const maxRetries = 3;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { credentials } = await this.oauth2Client.refreshAccessToken();
          console.log('[GoogleOAuth/Gmail] Token refresh successful on attempt', attempt);
          
          if (credentials.access_token) {
            const encryptedAccessToken = encryptToken(credentials.access_token);
            const expiryDate = credentials.expiry_date 
              ? new Date(credentials.expiry_date)
              : new Date(Date.now() + 3600 * 1000);
            
            await this.storage.updateUser(userId, {
              googleCalendarAccessToken: encryptedAccessToken,
              googleCalendarTokenExpiry: expiryDate,
            });
            
            this.oauth2Client.setCredentials(credentials);
          }
          lastError = null;
          break;
        } catch (refreshError: any) {
          lastError = refreshError;
          console.error(`[GoogleOAuth/Gmail] TOKEN REFRESH FAILED (attempt ${attempt}/${maxRetries}) for user:`, userId);
          console.error('[GoogleOAuth/Gmail] Error:', refreshError.message);
          
          // Check if this is a permanent error
          const isPermanentError = this.isPermanentTokenError(refreshError);
          
          if (isPermanentError) {
            console.error('[GoogleOAuth/Gmail] Permanent error detected - token has been revoked or is invalid');
            await this.storage.updateUser(userId, {
              googleCalendarEmail: null,
              googleCalendarAccessToken: null,
              googleCalendarRefreshToken: null,
              googleCalendarTokenExpiry: null,
              googleCalendarConnectedAt: null,
            });
            throw new Error('Google account access has been revoked. Please reconnect.');
          }
          
          // For temporary errors, wait before retrying
          if (attempt < maxRetries) {
            console.log(`[GoogleOAuth/Gmail] Temporary error, retrying in ${attempt * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }
      
      // If we exhausted retries but it wasn't a permanent error, don't disconnect
      if (lastError) {
        console.error('[GoogleOAuth/Gmail] Token refresh failed after all retries, but keeping tokens for retry');
        throw new Error('Unable to refresh Google account connection. Please try again in a moment.');
      }
    }
    
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }
}
