import { storage } from '../storage';
import { GoogleOAuthService } from './googleOAuthService';
import { getAutoBillCreatorService } from './autoBillCreator';
import type { ParsedEmail, EmailAttachment } from './emailParser';

let pollerInterval: NodeJS.Timeout | null = null;
let googleOAuthService: GoogleOAuthService | null = null;

function getGoogleOAuthService(): GoogleOAuthService {
  if (!googleOAuthService) {
    googleOAuthService = new GoogleOAuthService(storage);
  }
  return googleOAuthService;
}

export async function pollBillInbox(): Promise<{ processed: number; errors: string[] }> {
  const settings = await storage.getCompanySettings();

  if (!settings) {
    return { processed: 0, errors: [] };
  }

  if (!settings.billInboxPollingEnabled) {
    return { processed: 0, errors: [] };
  }

  if (
    !settings.billInboxGmailEmail ||
    !settings.billInboxGmailAccessToken ||
    !settings.billInboxGmailRefreshToken
  ) {
    console.log('[BillInbox] Polling enabled but no Gmail account connected — skipping');
    return { processed: 0, errors: [] };
  }

  console.log(`[BillInbox] Polling ${settings.billInboxGmailEmail} for new invoices...`);

  let gmail: any;
  try {
    gmail = await getGoogleOAuthService().getBillInboxGmailClient({
      billInboxGmailAccessToken: settings.billInboxGmailAccessToken,
      billInboxGmailRefreshToken: settings.billInboxGmailRefreshToken,
      billInboxGmailTokenExpiry: settings.billInboxGmailTokenExpiry,
    });
  } catch (err: any) {
    console.error('[BillInbox] Failed to get Gmail client (token error):', err.message);
    await storage.updateCompanySettings({
      billInboxStatus: 'error',
      billInboxLastError: err.message,
      billInboxLastErrorAt: new Date(),
    });
    return { processed: 0, errors: [err.message] };
  }

  let messageIds: string[] = [];
  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread has:attachment',
      maxResults: 20,
    });
    messageIds = (listRes.data.messages || []).map((m: any) => m.id);
  } catch (err: any) {
    const isAuthError = err.code === 401 || err.code === 403 || /invalid_grant|token.*expired|unauthorized/i.test(err.message);
    console.error('[BillInbox] Failed to list messages:', err.message);
    if (isAuthError) {
      await storage.updateCompanySettings({
        billInboxStatus: 'error',
        billInboxLastError: err.message,
        billInboxLastErrorAt: new Date(),
      });
    }
    return { processed: 0, errors: [err.message] };
  }

  if (messageIds.length === 0) {
    await storage.updateCompanySettings({
      billInboxLastPolledAt: new Date(),
      billInboxStatus: null,
      billInboxLastError: null,
    });
    return { processed: 0, errors: [] };
  }

  console.log(`[BillInbox] Found ${messageIds.length} unread message(s) with attachments`);

  const autoBillCreator = getAutoBillCreatorService();
  let processed = 0;
  const errors: string[] = [];

  for (const messageId of messageIds) {
    try {
      // Fix 1: Duplicate prevention — skip if already imported
      const existing = await storage.getBillByGmailMessageId(messageId);
      if (existing) {
        console.log(`[BillInbox] Message ${messageId} already imported as bill ${existing.billNumber} — marking read and skipping`);
        await markRead(gmail, messageId);
        continue;
      }

      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const msg = msgRes.data;
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('subject') || '(no subject)';
      const from = getHeader('from') || '';
      const to = getHeader('to') || '';

      const attachments = await extractAttachments(gmail, messageId, msg.payload);

      if (attachments.length === 0) {
        await markRead(gmail, messageId);
        continue;
      }

      const parsedEmail: ParsedEmail = {
        subject,
        from,
        to,
        text: msg.snippet || '',
        html: '',
        attachments,
      };

      const results = await autoBillCreator.processEmailInvoices(parsedEmail, {
        defaultUserId: null,
        autoMatch: true,
        gmailMessageId: messageId,
      });

      const anySuccess = results.some(r => r.success);
      if (anySuccess) {
        processed++;
        console.log(`[BillInbox] Created bill(s) from message "${subject}" (from: ${from})`);
      }

      const allErrors = results.filter(r => !r.success).map(r => r.error || 'Unknown error');
      errors.push(...allErrors);

      await markRead(gmail, messageId);
    } catch (err: any) {
      console.error(`[BillInbox] Error processing message ${messageId}:`, err.message);
      errors.push(err.message);
    }
  }

  // Fix 2: Clear error state on a successful poll cycle
  await storage.updateCompanySettings({
    billInboxLastPolledAt: new Date(),
    billInboxStatus: null,
    billInboxLastError: null,
  });

  console.log(`[BillInbox] Poll complete — ${processed} bill(s) created, ${errors.length} error(s)`);
  return { processed, errors };
}

async function extractAttachments(gmail: any, messageId: string, payload: any): Promise<EmailAttachment[]> {
  const attachments: EmailAttachment[] = [];

  async function walkParts(part: any) {
    if (!part) return;

    if (part.filename && part.body) {
      const contentType = (part.mimeType || '').toLowerCase();
      const ext = (part.filename.split('.').pop() || '').toLowerCase();
      const isInvoice = ['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext) ||
        ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(contentType);

      if (isInvoice) {
        let data = part.body.data;

        if (!data && part.body.attachmentId) {
          try {
            const attRes = await gmail.users.messages.attachments.get({
              userId: 'me',
              messageId,
              id: part.body.attachmentId,
            });
            data = attRes.data.data;
          } catch (e) {
            return;
          }
        }

        if (data) {
          const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
          attachments.push({
            filename: part.filename,
            content: base64,
            contentType: part.mimeType || 'application/octet-stream',
          });
        }
      }
    }

    if (part.parts) {
      for (const child of part.parts) {
        await walkParts(child);
      }
    }
  }

  await walkParts(payload);
  return attachments;
}

async function markRead(gmail: any, messageId: string) {
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  } catch (err: any) {
    console.warn(`[BillInbox] Failed to mark message ${messageId} as read:`, err.message);
  }
}

export function startGmailBillPoller(intervalMinutes: number = 5) {
  if (pollerInterval) {
    console.log('[BillInbox] Poller already running');
    return;
  }

  console.log(`[BillInbox] Starting Gmail bill poller (every ${intervalMinutes} minutes)`);

  setTimeout(() => {
    pollBillInbox().catch(console.error);
  }, 15000);

  pollerInterval = setInterval(() => {
    pollBillInbox().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopGmailBillPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[BillInbox] Poller stopped');
  }
}
