import { google } from 'googleapis';
import { GoogleOAuthService } from './googleOAuthService';
import type { IStorage } from '../storage';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentVia: 'gmail' | 'resend';
}

export class GmailEmailService {
  constructor(
    private storage: IStorage,
    private googleOAuthService: GoogleOAuthService
  ) {}

  private createEmailMessage(from: string, to: string | string[], subject: string, html: string): string {
    const toAddresses = Array.isArray(to) ? to.join(', ') : to;
    
    const messageParts = [
      `From: ${from}`,
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html
    ];
    
    const message = messageParts.join('\r\n');
    return Buffer.from(message).toString('base64url');
  }

  async sendEmailAsUser(userId: string, params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const user = await this.storage.getUser(userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (!user.useGmailForSending) {
        return {
          success: false,
          error: 'Gmail sending is not enabled for this user',
          sentVia: 'resend'
        };
      }
      
      if (!user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
        throw new Error('Google account not connected. Please reconnect your Google account to enable Gmail sending.');
      }
      
      const fromEmail = user.googleCalendarEmail;
      if (!fromEmail) {
        throw new Error('Google email address not found for user');
      }
      
      const fromName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'BuildPro';
      const fromAddress = `${fromName} <${fromEmail}>`;
      
      const gmail = await this.googleOAuthService.getGmailClient(userId);
      
      const raw = this.createEmailMessage(fromAddress, params.to, params.subject, params.html);
      
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw
        }
      });
      
      console.log(`✅ Gmail email sent successfully from ${fromEmail}`);
      console.log(`   Message ID: ${response.data.id}`);
      console.log(`   To: ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`);
      
      return {
        success: true,
        messageId: response.data.id,
        sentVia: 'gmail'
      };
    } catch (error: any) {
      console.error('❌ Gmail send error:', error.message);
      
      if (error.code === 401 || error.message?.includes('invalid_grant')) {
        return {
          success: false,
          error: 'Gmail authorization expired. Please reconnect your Google account.',
          sentVia: 'gmail'
        };
      }
      
      if (error.code === 403) {
        return {
          success: false,
          error: 'Gmail sending permission denied. Please reconnect your Google account and grant email permissions.',
          sentVia: 'gmail'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Failed to send email via Gmail',
        sentVia: 'gmail'
      };
    }
  }

  async canSendViaGmail(userId: string): Promise<{
    canSend: boolean;
    email: string | null;
    reason?: string;
  }> {
    try {
      const user = await this.storage.getUser(userId);
      
      if (!user) {
        return { canSend: false, email: null, reason: 'User not found' };
      }
      
      if (!user.useGmailForSending) {
        return { canSend: false, email: null, reason: 'Gmail sending not enabled' };
      }
      
      if (!user.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
        return { canSend: false, email: null, reason: 'Google account not connected' };
      }
      
      return {
        canSend: true,
        email: user.googleCalendarEmail
      };
    } catch (error: any) {
      return { canSend: false, email: null, reason: error.message };
    }
  }
}
