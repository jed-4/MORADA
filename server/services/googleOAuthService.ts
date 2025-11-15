import { google } from 'googleapis';
import { randomBytes, createHash } from 'crypto';
import { encryptToken, decryptToken } from '../utils/encryption';
import type { IStorage } from '../storage';
import type { User } from '@shared/schema';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
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
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      return 'http://localhost:5000/api/google-calendar/callback';
    }
    return 'https://buildpro4.replit.app/api/google-calendar/callback';
  }
  
  generateAuthUrl(userId: string): string {
    const codeVerifier = this.generateCodeVerifier();
    const state = this.generateState(userId, codeVerifier);
    
    console.log('🔍 [OAuth] Generating auth URL for user:', userId);
    console.log('🔍 [OAuth] Client ID:', process.env.GOOGLE_OAUTH_CLIENT_ID?.substring(0, 20) + '...');
    console.log('🔍 [OAuth] Redirect URI:', this.getRedirectUri());
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent',
      code_challenge: this.generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    
    console.log('🔍 [OAuth] Generated auth URL:', authUrl.substring(0, 150) + '...');
    
    return authUrl;
  }
  
  private generateState(userId: string, codeVerifier: string): string {
    const nonce = randomBytes(16).toString('hex');
    return Buffer.from(JSON.stringify({ userId, nonce, timestamp: Date.now(), codeVerifier })).toString('base64');
  }
  
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }
  
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }
  
  parseState(state: string): { userId: string; nonce: string; timestamp: number; codeVerifier: string } {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      
      if (!parsed.userId || !parsed.nonce || !parsed.timestamp || !parsed.codeVerifier) {
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
    const { userId, codeVerifier } = this.parseState(state);
    
    const { tokens } = await this.oauth2Client.getToken({
      code,
      codeVerifier,
    });
    
    if (!tokens.access_token || !tokens.refresh_token) {
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
    
    return updatedUser;
  }
  
  async getCalendarClient(userId: string): Promise<any> {
    const user = await this.storage.getUser(userId);
    
    if (!user || !user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      throw new Error('Google Calendar not connected for this user');
    }
    
    const accessToken = decryptToken(user.googleCalendarAccessToken);
    const refreshToken = decryptToken(user.googleCalendarRefreshToken);
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: user.googleCalendarTokenExpiry?.getTime(),
    });
    
    const shouldRefresh = !user.googleCalendarTokenExpiry || 
      user.googleCalendarTokenExpiry.getTime() < Date.now() + 5 * 60 * 1000;
    
    if (shouldRefresh) {
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
  }> {
    const user = await this.storage.getUser(userId);
    
    return {
      connected: !!(user?.googleCalendarAccessToken && user?.googleCalendarRefreshToken),
      email: user?.googleCalendarEmail || null,
    };
  }
}
