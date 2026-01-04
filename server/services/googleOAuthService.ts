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
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        console.log('[GoogleOAuth] Token refresh successful');
        
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
      } catch (refreshError: any) {
        console.error('[GoogleOAuth] TOKEN REFRESH FAILED for user:', userId);
        console.error('[GoogleOAuth] Error name:', refreshError.name);
        console.error('[GoogleOAuth] Error message:', refreshError.message);
        console.error('[GoogleOAuth] Error code:', refreshError.code);
        console.error('[GoogleOAuth] Full error:', JSON.stringify(refreshError, null, 2));
        console.error('[GoogleOAuth] Clearing invalid tokens - user will need to reconnect');
        
        await this.storage.updateUser(userId, {
          googleCalendarEmail: null,
          googleCalendarAccessToken: null,
          googleCalendarRefreshToken: null,
          googleCalendarTokenExpiry: null,
          googleCalendarConnectedAt: null,
        });
        throw new Error('Google Calendar token expired. Please reconnect your calendar.');
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
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
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
      } catch (refreshError: any) {
        console.error('[GoogleOAuth/Gmail] TOKEN REFRESH FAILED for user:', userId);
        console.error('[GoogleOAuth/Gmail] Error:', refreshError.message);
        await this.storage.updateUser(userId, {
          googleCalendarEmail: null,
          googleCalendarAccessToken: null,
          googleCalendarRefreshToken: null,
          googleCalendarTokenExpiry: null,
          googleCalendarConnectedAt: null,
        });
        throw new Error('Google account token expired. Please reconnect.');
      }
    }
    
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }
}
