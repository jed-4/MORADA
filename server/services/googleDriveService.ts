import { google } from 'googleapis';
import { randomBytes, createHash, createHmac } from 'crypto';
import { encryptToken, decryptToken } from '../utils/encryption';
import type { IStorage } from '../storage';
import type { Company } from '@shared/schema';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getStateSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('STATE_SECRET not configured: GOOGLE_OAUTH_ENCRYPTION_KEY or SESSION_SECRET must be set');
  }
  return secret;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  isFolder: boolean;
}

export interface DriveFolder {
  id: string;
  name: string;
  path: string[];
}

export class GoogleDriveService {
  constructor(private storage: IStorage) {}
  
  private getRedirectUri(host: string): string {
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocalhost ? 'http' : 'https';
    return `${protocol}://${host}/api/google-drive/callback`;
  }
  
  private async getOAuthClient(companyId: string, host: string): Promise<any> {
    const company = await this.storage.getCompany(companyId);
    
    if (!company) {
      throw new Error('Company not found');
    }
    
    // Use per-company credentials if configured, otherwise fall back to global BuildPro credentials
    let clientId = company.googleDriveClientId;
    let clientSecret = company.googleDriveClientSecret ? decryptToken(company.googleDriveClientSecret) : null;
    
    // Fallback to global BuildPro credentials if company credentials not configured
    if (!clientId || !clientSecret) {
      clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || null;
      clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;
      
      if (!clientId || !clientSecret) {
        throw new Error('Google Drive OAuth credentials not configured. Please add your Client ID and Secret in Settings, or contact support.');
      }
      
      console.log('🔍 [Drive OAuth] Using fallback BuildPro credentials for company:', companyId);
    } else {
      console.log('🔍 [Drive OAuth] Using company-specific credentials for company:', companyId);
    }
    
    const redirectUri = this.getRedirectUri(host);
    
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
  
  async generateAuthUrl(companyId: string, userId: string, host: string): Promise<string> {
    const oauth2Client = await this.getOAuthClient(companyId, host);
    const codeVerifier = this.generateCodeVerifier();
    const state = this.generateState(companyId, userId, codeVerifier, host);
    const redirectUri = this.getRedirectUri(host);
    
    console.log('🔍 [Drive OAuth] Generating auth URL for company:', companyId);
    console.log('🔍 [Drive OAuth] Redirect URI:', redirectUri);
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent',
      code_challenge: this.generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    
    return authUrl;
  }
  
  private generateState(companyId: string, userId: string, codeVerifier: string, host: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload = JSON.stringify({ 
      companyId, 
      userId, 
      nonce, 
      timestamp: Date.now(), 
      codeVerifier,
      host
    });
    
    const signature = createHmac('sha256', getStateSecret())
      .update(payload)
      .digest('hex');
    
    const signedState = JSON.stringify({ payload, signature });
    return Buffer.from(signedState).toString('base64');
  }
  
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }
  
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }
  
  parseState(state: string): { companyId: string; userId: string; nonce: string; timestamp: number; codeVerifier: string; host: string } {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf8');
      const { payload, signature } = JSON.parse(decoded);
      
      if (!payload || !signature) {
        throw new Error('Invalid state format - missing signature');
      }
      
      const expectedSignature = createHmac('sha256', getStateSecret())
        .update(payload)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('[Drive OAuth] State signature mismatch - possible tampering');
        throw new Error('Invalid state signature');
      }
      
      const parsed = JSON.parse(payload);
      
      if (!parsed.companyId || !parsed.userId || !parsed.nonce || !parsed.timestamp || !parsed.codeVerifier || !parsed.host) {
        throw new Error('Invalid state format');
      }
      
      const age = Date.now() - parsed.timestamp;
      if (age > 10 * 60 * 1000) {
        throw new Error('State expired (older than 10 minutes)');
      }
      
      return parsed;
    } catch (error: any) {
      console.error('[Drive OAuth] State parsing error:', error.message);
      throw new Error('Invalid state parameter');
    }
  }
  
  async handleCallback(code: string, state: string): Promise<Company> {
    const { companyId, userId, codeVerifier, host } = this.parseState(state);
    
    const oauth2Client = await this.getOAuthClient(companyId, host);
    
    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier,
    });
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing tokens from Google OAuth response');
    }
    
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
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
    
    const updatedCompany = await this.storage.updateCompany(companyId, {
      googleDriveEmail: email,
      googleDriveAccessToken: encryptedAccessToken,
      googleDriveRefreshToken: encryptedRefreshToken,
      googleDriveTokenExpiry: expiryDate,
      googleDriveConnectedAt: new Date(),
      googleDriveConnectedBy: userId,
    });
    
    if (!updatedCompany) {
      throw new Error('Failed to update company with Google Drive tokens');
    }
    
    console.log('✅ [Drive OAuth] Successfully connected Google Drive for company:', companyId);
    
    return updatedCompany;
  }
  
  async getDriveClient(companyId: string): Promise<any> {
    const company = await this.storage.getCompany(companyId);
    
    if (!company || !company.googleDriveAccessToken || !company.googleDriveRefreshToken) {
      throw new Error('Google Drive not connected for this company');
    }
    
    // Get per-company OAuth credentials with fallback to global credentials
    let clientId = company.googleDriveClientId;
    let clientSecret = company.googleDriveClientSecret ? decryptToken(company.googleDriveClientSecret) : null;
    
    // Fallback to global BuildPro credentials if company credentials not configured
    if (!clientId || !clientSecret) {
      clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || null;
      clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;
      
      if (!clientId || !clientSecret) {
        throw new Error('Google Drive OAuth credentials not configured');
      }
    }
    
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    
    const accessToken = decryptToken(company.googleDriveAccessToken);
    const refreshToken = decryptToken(company.googleDriveRefreshToken);
    
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: company.googleDriveTokenExpiry?.getTime(),
    });
    
    const shouldRefresh = !company.googleDriveTokenExpiry || 
      company.googleDriveTokenExpiry.getTime() < Date.now() + 5 * 60 * 1000;
    
    if (shouldRefresh) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        if (credentials.access_token) {
          const encryptedAccessToken = encryptToken(credentials.access_token);
          const expiryDate = credentials.expiry_date 
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + 3600 * 1000);
          
          await this.storage.updateCompany(companyId, {
            googleDriveAccessToken: encryptedAccessToken,
            googleDriveTokenExpiry: expiryDate,
          });
          
          oauth2Client.setCredentials(credentials);
        }
      } catch (error) {
        console.error('[Drive] Error refreshing token:', error);
        throw new Error('Failed to refresh Google Drive token. Please reconnect.');
      }
    }
    
    return google.drive({ version: 'v3', auth: oauth2Client });
  }
  
  async disconnectDrive(companyId: string): Promise<void> {
    await this.storage.updateCompany(companyId, {
      googleDriveEmail: null,
      googleDriveAccessToken: null,
      googleDriveRefreshToken: null,
      googleDriveTokenExpiry: null,
      googleDriveConnectedAt: null,
      googleDriveConnectedBy: null,
      googleDriveRootFolderId: null,
    });
    console.log('🔌 [Drive] Disconnected Google Drive for company:', companyId);
  }
  
  async getConnectionStatus(companyId: string): Promise<{
    connected: boolean;
    credentialsConfigured: boolean;
    email: string | null;
    tokenExpiry: Date | null;
    isExpired: boolean;
    connectedAt: Date | null;
    connectedBy: string | null;
    rootFolderId: string | null;
  }> {
    const company = await this.storage.getCompany(companyId);
    
    const hasCredentials = !!(company?.googleDriveClientId && company?.googleDriveClientSecret);
    const hasTokens = !!(company?.googleDriveAccessToken && company?.googleDriveRefreshToken);
    const tokenExpiry = company?.googleDriveTokenExpiry || null;
    const isExpired = tokenExpiry ? tokenExpiry.getTime() < Date.now() : false;
    
    return {
      connected: hasTokens,
      credentialsConfigured: hasCredentials,
      email: company?.googleDriveEmail || null,
      tokenExpiry,
      isExpired,
      connectedAt: company?.googleDriveConnectedAt || null,
      connectedBy: company?.googleDriveConnectedBy || null,
      rootFolderId: company?.googleDriveRootFolderId || null,
    };
  }
  
  async saveCredentials(companyId: string, clientId: string, clientSecret: string): Promise<void> {
    const encryptedSecret = encryptToken(clientSecret);
    
    await this.storage.updateCompany(companyId, {
      googleDriveClientId: clientId,
      googleDriveClientSecret: encryptedSecret,
    });
    
    console.log('✅ [Drive] Saved OAuth credentials for company:', companyId);
  }
  
  async listFiles(companyId: string, folderId?: string): Promise<DriveFile[]> {
    const drive = await this.getDriveClient(companyId);
    const company = await this.storage.getCompany(companyId);
    
    const parentId = folderId || company?.googleDriveRootFolderId || 'root';
    
    const response = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, thumbnailLink, iconLink)',
      orderBy: 'folder,name',
      pageSize: 100,
    });
    
    return (response.data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      parents: file.parents,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      thumbnailLink: file.thumbnailLink,
      iconLink: file.iconLink,
      isFolder: file.mimeType === 'application/vnd.google-apps.folder',
    }));
  }
  
  async listSharedDrives(companyId: string): Promise<{ id: string; name: string }[]> {
    const drive = await this.getDriveClient(companyId);
    
    try {
      const response = await drive.drives.list({
        fields: 'drives(id, name)',
        pageSize: 100,
      });
      
      return (response.data.drives || []).map((d: any) => ({
        id: d.id,
        name: d.name,
      }));
    } catch (error) {
      console.error('[Drive] Error listing shared drives:', error);
      return [];
    }
  }
  
  async getFile(companyId: string, fileId: string): Promise<DriveFile> {
    const drive = await this.getDriveClient(companyId);
    
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, thumbnailLink, iconLink',
    });
    
    const file = response.data;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      parents: file.parents,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      thumbnailLink: file.thumbnailLink,
      iconLink: file.iconLink,
      isFolder: file.mimeType === 'application/vnd.google-apps.folder',
    };
  }
  
  async createFolder(companyId: string, name: string, parentId?: string): Promise<DriveFile> {
    const drive = await this.getDriveClient(companyId);
    const company = await this.storage.getCompany(companyId);
    
    const parent = parentId || company?.googleDriveRootFolderId || 'root';
    
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parent],
      },
      fields: 'id, name, mimeType, createdTime, modifiedTime, parents, webViewLink',
    });
    
    const file = response.data;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      parents: file.parents,
      webViewLink: file.webViewLink,
      isFolder: true,
    };
  }
  
  async uploadFile(
    companyId: string, 
    fileName: string, 
    mimeType: string, 
    buffer: Buffer, 
    parentId?: string
  ): Promise<DriveFile> {
    const drive = await this.getDriveClient(companyId);
    const company = await this.storage.getCompany(companyId);
    
    const parent = parentId || company?.googleDriveRootFolderId || 'root';
    
    const { Readable } = require('stream');
    const stream = Readable.from(buffer);
    
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parent],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, thumbnailLink',
    });
    
    const file = response.data;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      parents: file.parents,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      thumbnailLink: file.thumbnailLink,
      isFolder: false,
    };
  }
  
  async downloadFile(companyId: string, fileId: string): Promise<{ data: Buffer; mimeType: string; name: string }> {
    const drive = await this.getDriveClient(companyId);
    
    const metaResponse = await drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });
    
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    }, {
      responseType: 'arraybuffer',
    });
    
    return {
      data: Buffer.from(response.data),
      mimeType: metaResponse.data.mimeType,
      name: metaResponse.data.name,
    };
  }
  
  async deleteFile(companyId: string, fileId: string): Promise<void> {
    const drive = await this.getDriveClient(companyId);
    
    await drive.files.delete({
      fileId,
    });
  }
  
  async setRootFolder(companyId: string, folderId: string | null): Promise<void> {
    await this.storage.updateCompany(companyId, {
      googleDriveRootFolderId: folderId,
    });
  }
  
  async getFolderPath(companyId: string, folderId: string): Promise<DriveFolder[]> {
    const drive = await this.getDriveClient(companyId);
    const company = await this.storage.getCompany(companyId);
    const rootId = company?.googleDriveRootFolderId || 'root';
    
    const path: DriveFolder[] = [];
    let currentId = folderId;
    
    while (currentId && currentId !== 'root') {
      try {
        const response = await drive.files.get({
          fileId: currentId,
          fields: 'id, name, parents',
        });
        
        const file = response.data;
        path.unshift({
          id: file.id,
          name: file.name,
          path: [],
        });
        
        if (currentId === rootId) break;
        
        currentId = file.parents?.[0];
      } catch (error) {
        break;
      }
    }
    
    return path;
  }
}
