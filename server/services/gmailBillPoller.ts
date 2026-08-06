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

/**
 * Polls one company's connected Gmail inbox. The companyId is required: this
 * reads and rewrites OAuth credentials, so there is no safe default — polling
 * "whichever settings row came back first" is how one company's inbox ends up
 * filing invoices into another company's books.
 */
export async function pollBillInbox(companyId: string): Promise<{ processed: number; errors: string[] }> {
  if (!companyId) {
    throw new Error('pollBillInbox requires a companyId');
  }

  const settings = await storage.getCompanySettings(companyId);

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

  console.log(`[BillInbox] Polling ${settings.billInboxGmailEmail} for new invoices (company ${companyId})...`);
  console.log(`[BillInbox] Token present: accessToken=${!!settings.billInboxGmailAccessToken} refreshToken=${!!settings.billInboxGmailRefreshToken} expiry=${settings.billInboxGmailTokenExpiry}`);

  let gmail: any;
  try {
    gmail = await getGoogleOAuthService().getBillInboxGmailClient({
      billInboxGmailAccessToken: settings.billInboxGmailAccessToken,
      billInboxGmailRefreshToken: settings.billInboxGmailRefreshToken,
      billInboxGmailTokenExpiry: settings.billInboxGmailTokenExpiry,
    });
    console.log('[BillInbox] Gmail client obtained successfully');
  } catch (err: any) {
    console.error('[BillInbox] Failed to get Gmail client (token error):', err.message);
    await storage.updateCompanySettings({
      billInboxStatus: 'error',
      billInboxLastError: err.message,
      billInboxLastErrorAt: new Date(),
    }, companyId);
    return { processed: 0, errors: [err.message] };
  }

  // Confirm which Google account we're actually reading
  try {
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    console.log(`[BillInbox] Authenticated as Gmail account: ${profileRes.data.emailAddress} (total messages: ${profileRes.data.messagesTotal})`);
  } catch (err: any) {
    console.warn('[BillInbox] Could not fetch Gmail profile:', err.message);
  }

  let messageIds: string[] = [];
  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread has:attachment in:anywhere',
      maxResults: 20,
    });
    const messages = listRes.data.messages || [];
    messageIds = messages.map((m: any) => m.id);
    console.log(`[BillInbox] Gmail query "is:unread has:attachment in:anywhere" returned ${messageIds.length} message(s). ResultSizeEstimate: ${listRes.data.resultSizeEstimate}`);
  } catch (err: any) {
    const isAuthError = err.code === 401 || err.code === 403 || /invalid_grant|token.*expired|unauthorized/i.test(err.message);
    console.error('[BillInbox] Failed to list messages:', err.message, 'code:', err.code, 'status:', err.status);
    if (isAuthError) {
      await storage.updateCompanySettings({
        billInboxStatus: 'error',
        billInboxLastError: err.message,
        billInboxLastErrorAt: new Date(),
      }, companyId);
    }
    return { processed: 0, errors: [err.message] };
  }

  if (messageIds.length === 0) {
    console.log('[BillInbox] No unread messages with attachments found — inbox is clear or email is in a label/spam');
    await storage.updateCompanySettings({
      billInboxLastPolledAt: new Date(),
      billInboxStatus: null,
      billInboxLastError: null,
    }, companyId);
    return { processed: 0, errors: [] };
  }

  console.log(`[BillInbox] Found ${messageIds.length} unread message(s) with attachments`);

  const autoBillCreator = getAutoBillCreatorService();
  let processed = 0;
  const errors: string[] = [];

  for (const messageId of messageIds) {
    try {
      // Duplicate prevention — if we already created a bill for this message
      // (regardless of whether OCR has run), mark it read and skip. The user
      // controls when AI extraction happens via the bulk "Run AI Read" action.
      const existing = await storage.getBillByGmailMessageId(messageId);
      if (existing) {
        console.log(`[BillInbox] Message ${messageId} already imported as bill ${existing.billNumber} — marking read`);
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

      // Bills are scoped to the company whose Gmail credentials we just read —
      // the same company this poll was invoked for. No fallback, no guessing.
      const results = await autoBillCreator.processEmailInvoices(parsedEmail, {
        defaultUserId: null,
        autoMatch: true,
        gmailMessageId: messageId,
        companyId,
        existingBillId: existing?.id,
      });

      const anySuccess = results.some(r => r.success);
      const allErrors = results.filter(r => !r.success).map(r => r.error || 'Unknown error');
      errors.push(...allErrors);

      if (anySuccess) {
        processed++;
        console.log(`[BillInbox] Created bill(s) from message "${subject}" (from: ${from})`);
        // Only mark as read once at least one bill was successfully created
        await markRead(gmail, messageId);
      } else {
        console.warn(`[BillInbox] All attachments failed for message "${subject}" — leaving as unread for retry. Errors: ${allErrors.join('; ')}`);
      }
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
  }, companyId);

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

/**
 * Polls every company that has the bill inbox switched on.
 *
 * This is the only cross-tenant entry point, and it exists because the
 * scheduled poller has no request context to take a company from. Each company
 * is polled in its own try/catch so one tenant's expired token or revoked
 * consent can't stop the rest from being polled.
 */
export async function pollAllBillInboxes(): Promise<{ processed: number; errors: string[] }> {
  let allSettings: Awaited<ReturnType<typeof storage.getAllCompanySettings>>;
  try {
    allSettings = await storage.getAllCompanySettings();
  } catch (err: any) {
    console.error('[BillInbox] Failed to load company settings for polling:', err.message);
    return { processed: 0, errors: [err.message] };
  }

  const pollable = allSettings.filter(
    (s) => s.companyId && s.billInboxPollingEnabled && s.billInboxGmailRefreshToken,
  );

  if (pollable.length === 0) {
    return { processed: 0, errors: [] };
  }

  // A settings row with no companyId can't be polled safely — we'd have no
  // company to file the resulting bills against. Surface it rather than
  // silently skipping, since it means the startup backfill hasn't run.
  const unowned = allSettings.filter(
    (s) => !s.companyId && s.billInboxPollingEnabled && s.billInboxGmailRefreshToken,
  );
  if (unowned.length > 0) {
    console.error(
      `[BillInbox] ${unowned.length} connected inbox(es) have no company_id — skipping. Run the startup backfill.`,
    );
  }

  console.log(`[BillInbox] Polling ${pollable.length} connected inbox(es)`);

  let processed = 0;
  const errors: string[] = [];

  for (const settings of pollable) {
    const companyId = settings.companyId!;
    try {
      const result = await pollBillInbox(companyId);
      processed += result.processed;
      errors.push(...result.errors);
    } catch (err: any) {
      console.error(`[BillInbox] Poll failed for company ${companyId}:`, err.message);
      errors.push(`${companyId}: ${err.message}`);
    }
  }

  return { processed, errors };
}

export function startGmailBillPoller(intervalMinutes: number = 5) {
  if (pollerInterval) {
    console.log('[BillInbox] Poller already running');
    return;
  }

  console.log(`[BillInbox] Starting Gmail bill poller (every ${intervalMinutes} minutes)`);

  setTimeout(() => {
    pollAllBillInboxes().catch(console.error);
  }, 15000);

  pollerInterval = setInterval(() => {
    pollAllBillInboxes().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopGmailBillPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[BillInbox] Poller stopped');
  }
}
