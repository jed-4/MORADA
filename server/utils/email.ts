import { Resend } from 'resend';
import { GmailEmailService } from '../services/gmailEmailService';
import { GoogleOAuthService } from '../services/googleOAuthService';
import type { IStorage } from '../storage';

if (!process.env.RESEND_API_KEY) {
  console.error('⚠️  RESEND_API_KEY is not set - email functionality will not work');
}

const resend = new Resend(process.env.RESEND_API_KEY);

let gmailService: GmailEmailService | null = null;
let gmailServiceInitialized = false;

export function initializeEmailServices(storageInstance: IStorage, googleOAuthService: GoogleOAuthService) {
  gmailService = new GmailEmailService(storageInstance, googleOAuthService);
  gmailServiceInitialized = true;
  console.log('📧 Email services initialized with Gmail support');
}

export interface SendEmailAttachment {
  filename: string;
  content: string;
  mimeType?: string;
}

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  userId?: string;
  attachments?: SendEmailAttachment[];
  from?: string;
  replyTo?: string;
}

async function sendEmailWithFallback(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; sentVia: 'gmail' | 'resend'; fromAddress?: string }> {
  const { to, subject, html, userId, attachments, from, replyTo } = params;
  
  if (userId && gmailServiceInitialized && gmailService) {
    try {
      const canSend = await gmailService.canSendViaGmail(userId);
      
      if (canSend.canSend) {
        console.log(`📧 Attempting Gmail send for user ${userId} (${canSend.email})`);
        const result = await gmailService.sendEmailAsUser(userId, {
          to,
          subject,
          html,
          attachments,
          replyTo,
        } as any);
        
        if (result.success) {
          return { success: true, messageId: result.messageId, sentVia: 'gmail', fromAddress: canSend.email ?? undefined };
        }
        
        console.log(`⚠️ Gmail sending failed, falling back to Resend:`, result.error);
      }
    } catch (error: any) {
      console.log(`⚠️ Gmail check failed, falling back to Resend:`, error.message);
    }
  }
  
  const toAddresses = Array.isArray(to) ? to : [to];

  const resendAttachments = attachments?.map(a => ({
    filename: a.filename,
    content: Buffer.from(a.content, 'base64'),
  }));

  const sendParams: any = {
    from: from || 'Morada <noreply@moradaco.com.au>',
    to: toAddresses,
    subject,
    html,
  };

  if (replyTo) sendParams.reply_to = replyTo;
  if (resendAttachments?.length) sendParams.attachments = resendAttachments;

  const { data, error } = await resend.emails.send(sendParams);
  
  if (error) {
    throw new Error(`Failed to send email: ${error.message || 'Unknown error'}`);
  }
  
  return { success: true, messageId: data?.id, sentVia: 'resend', fromAddress: sendParams.from };
}

interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  companyName: string;
  inviteUrl: string;
  recipientName?: string;
  userId?: string;
  companyId?: string | null;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  companyName,
  inviteUrl,
  recipientName,
  userId,
  companyId,
}: SendInvitationEmailParams) {
  console.log(`📧 Attempting to send invitation email to ${to}`);
  
  const greeting = recipientName ? `Hi ${recipientName}` : 'Hi there';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Morada Invitation</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Morada</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                      ${greeting},
                    </h2>
                    
                    <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                      <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on Morada, the construction project management platform.
                    </p>
                    
                    <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                      Click the button below to accept your invitation and set up your account:
                    </p>
                    
                    <!-- Button -->
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td align="center">
                          <a href="${inviteUrl}" 
                             style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            Accept Invitation
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 32px 0 0; color: #718096; font-size: 14px; line-height: 1.6;">
                      Or copy and paste this link into your browser:<br>
                      <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
                    </p>
                    
                    <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
                    
                    <p style="margin: 0; color: #a0aec0; font-size: 13px; line-height: 1.5;">
                      This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 40px; text-align: center; background-color: #f7fafc; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                      © ${new Date().getFullYear()} Morada. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const subject = `You've been invited to join ${companyName} on Morada`;
  const record = { to, subject, html, userId, context: { type: 'team_invite', companyId } };

  try {
    const result = await sendEmailWithFallback({ to, subject, html, userId });

    console.log(`✅ Invitation email sent via ${result.sentVia}!`);
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Sent to: ${to}`);
    await recordDelivery(record, {
      provider: result.sentVia,
      messageId: result.messageId,
      fromAddress: result.fromAddress,
      status: 'sent',
    });
    return { id: result.messageId };
  } catch (error: any) {
    console.error('❌ Error sending invitation email:');
    console.error(`   Error type: ${error.constructor.name}`);
    console.error(`   Error message: ${error.message}`);
    await recordDelivery(record, { status: 'failed', detail: error?.message?.slice(0, 500) });
    throw error;
  }
}

interface SendClientPortalInviteEmailParams {
  to: string;
  recipientName?: string;
  companyName: string;
  projectNames: string[];
  inviteUrl: string;
  companyId?: string | null;
  contactId?: string | null;
}

// Client portal invites always send via Resend from the Morada address (no
// userId → no Gmail fallback), per the client-access requirements.
export async function sendClientPortalInviteEmail({
  to,
  recipientName,
  companyName,
  projectNames,
  inviteUrl,
  companyId,
  contactId,
}: SendClientPortalInviteEmailParams) {
  console.log(`📧 Attempting to send client portal invite email to ${to}`);

  const greeting = recipientName ? `Hi ${recipientName}` : 'Hi there';
  const projectLine = projectNames.length === 1
    ? `<strong>${projectNames[0]}</strong>`
    : projectNames.length > 1
      ? `your projects (<strong>${projectNames.join('</strong>, <strong>')}</strong>)`
      : 'your project';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Morada project access</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #A890D4 0%, #9b87c4 100%); border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Morada</h1>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                      ${greeting},
                    </h2>

                    <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                      <strong>${companyName}</strong> has invited you to view ${projectLine} on Morada.
                    </p>

                    <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                      Set a password to activate your access — after that you can log in any time with this email address.
                    </p>

                    <!-- Button -->
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td align="center">
                          <a href="${inviteUrl}"
                             style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #A890D4 0%, #9b87c4 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            Set your password
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 32px 0 0; color: #718096; font-size: 14px; line-height: 1.6;">
                      Or copy and paste this link into your browser:<br>
                      <a href="${inviteUrl}" style="color: #A890D4; word-break: break-all;">${inviteUrl}</a>
                    </p>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">

                    <p style="margin: 0; color: #a0aec0; font-size: 13px; line-height: 1.5;">
                      This link expires in 7 days and can only be used once. If you didn't expect this invitation, you can safely ignore this email.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 40px; text-align: center; background-color: #f8fafc; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                      © ${new Date().getFullYear()} Morada. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const subject = `${companyName} has invited you to view your project on Morada`;
  const record = { to, subject, html, context: { type: 'client_portal_invite', id: contactId, companyId } };

  try {
    const result = await sendEmailWithFallback({ to, subject, html });

    console.log(`✅ Client portal invite email sent via ${result.sentVia}!`);
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Sent to: ${to}`);
    await recordDelivery(record, {
      provider: result.sentVia,
      messageId: result.messageId,
      fromAddress: result.fromAddress,
      status: 'sent',
    });
    return { id: result.messageId };
  } catch (error: any) {
    console.error('❌ Error sending client portal invite email:');
    console.error(`   Error message: ${error.message}`);
    await recordDelivery(record, { status: 'failed', detail: error?.message?.slice(0, 500) });
    throw error;
  }
}

interface SendReminderEmailParams {
  to: string;
  recipientName: string;
  reminderTitle: string;
  reminderDescription?: string;
  linkedItemType?: string;
  linkedItemTitle?: string;
  priority?: string;
  userId?: string;
  companyId?: string | null;
}

export async function sendReminderEmail({
  to,
  recipientName,
  reminderTitle,
  reminderDescription,
  linkedItemType,
  linkedItemTitle,
  priority,
  userId,
  companyId,
}: SendReminderEmailParams) {
  console.log(`📧 Attempting to send reminder email to ${to}`);
  
  const priorityColor = priority === 'high' ? '#ef4444' : priority === 'low' ? '#22c55e' : '#3b82f6';
  const priorityLabel = priority === 'high' ? 'High Priority' : priority === 'low' ? 'Low Priority' : 'Normal';
  
  const linkedItemSection = linkedItemType && linkedItemTitle ? `
    <p style="margin: 16px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #A890D4;">
      <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Related ${linkedItemType.replace('_', ' ')}</span><br>
      <span style="color: #1e293b; font-size: 15px; font-weight: 500;">${linkedItemTitle}</span>
    </p>
  ` : '';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Morada Reminder</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 32px 40px 16px; text-align: center; background: linear-gradient(135deg, #A890D4 0%, #9b87c4 100%); border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Morada Reminder</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">
                      Hi ${recipientName},
                    </p>
                    
                    <h2 style="margin: 16px 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                      ${reminderTitle}
                    </h2>
                    
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${priorityColor}20; color: ${priorityColor}; border-radius: 4px; font-size: 12px; font-weight: 500;">
                      ${priorityLabel}
                    </span>
                    
                    ${reminderDescription ? `
                      <p style="margin: 20px 0; color: #475569; font-size: 15px; line-height: 1.6;">
                        ${reminderDescription}
                      </p>
                    ` : ''}
                    
                    ${linkedItemSection}
                    
                    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;">
                    
                    <p style="margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">
                      This is an automated reminder from Morada. Log in to your account to manage your reminders.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 20px 40px; text-align: center; background-color: #f8fafc; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                      © ${new Date().getFullYear()} Morada. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const subject = `Reminder: ${reminderTitle}`;
  const record = { to, subject, html, userId, context: { type: 'reminder', companyId } };

  try {
    const result = await sendEmailWithFallback({ to, subject, html, userId });

    console.log(`✅ Reminder email sent via ${result.sentVia}!`);
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Sent to: ${to}`);
    await recordDelivery(record, {
      provider: result.sentVia,
      messageId: result.messageId,
      fromAddress: result.fromAddress,
      status: 'sent',
    });
    return { id: result.messageId };
  } catch (error: any) {
    console.error('❌ Error sending reminder email:');
    console.error(`   Error message: ${error.message}`);
    await recordDelivery(record, { status: 'failed', detail: error?.message?.slice(0, 500) });
    throw error;
  }
}

export interface SendGenericEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  userId?: string;
  attachments?: SendEmailAttachment[];
  from?: string;
  replyTo?: string;
  /** What this email is about. Optional — a send with no context is still
   *  recorded, it just can't be shown against a document. */
  context?: EmailContext;
}

/** What an email was about, so its record can be shown against the document
 *  that caused it. */
export interface EmailContext {
  type: string;
  id?: string | null;
  companyId?: string | null;
}

interface DeliveryRecord {
  to: string | string[];
  subject: string;
  html?: string;
  replyTo?: string;
  attachments?: SendEmailAttachment[];
  userId?: string;
  context?: EmailContext;
}

/**
 * Context types whose body is never kept. Each carries a live sign-in or
 * set-password link; the log is readable by any admin, and a stored copy would
 * let one sign in as somebody else.
 */
export const REDACTED_CONTEXT_TYPES = new Set(["password_reset", "team_invite", "client_portal_invite"]);

/** Sends that nobody is waiting on — a failure here is otherwise silent. */
const BACKGROUND_CONTEXT_TYPES = new Set(["rfq_reminder", "proposal_reminder", "reminder", "client_decision"]);

/**
 * Where each context type's document lives, for resolving the project at write
 * time. Same mapping as the backfill in migrations/0114_email_log.sql.
 */
const PROJECT_TABLE_FOR_CONTEXT: Record<string, string> = {
  variation: "variations",
  client_decision: "variations",
  proposal: "proposals",
  proposal_reminder: "proposals",
  rfq: "rfqs",
  rfq_reminder: "rfqs",
  purchase_order: "purchase_orders",
  client_invoice: "client_invoices",
  selection: "selections",
  review_item: "review_items",
};

/** Attachments over this are listed but not kept. */
const MAX_STORED_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * An RFQ goes to every supplier with the same PDF; storing it once per email
 * would be N identical uploads. Keyed by content hash, short-lived on purpose —
 * this is a burst de-dupe, not a cache.
 */
const recentAttachmentUploads = new Map<string, { path: string; at: number }>();
const ATTACHMENT_DEDUPE_MS = 30 * 60 * 1000;

/**
 * Record the attempt. Deliberately best-effort: a logging failure must never
 * stop an email going out, or turn a delivered message into a 500.
 *
 * Every sender in this file goes through here, not just sendGenericEmail — the
 * send that prompted all this was a client portal invite, which has its own
 * function and would otherwise have stayed exactly as invisible as before.
 *
 * The project is resolved inside the INSERT (a sub-select on the context
 * document) rather than with a lookup first: the database is ~400ms away, and
 * this runs inside the request that sent the email.
 *
 * Returns the row id so the caller can link the send to its own record.
 */
async function recordDelivery(
  params: DeliveryRecord,
  outcome: { provider?: string; messageId?: string; fromAddress?: string; status: string; detail?: string },
): Promise<string | undefined> {
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const { emailDeliveries } = await import("@shared/schema");

    const contextType = params.context?.type ?? null;
    const contextId = params.context?.id ?? null;
    const companyId = params.context?.companyId ?? null;
    const redacted = !!contextType && REDACTED_CONTEXT_TYPES.has(contextType);
    const projectTable = contextType ? PROJECT_TABLE_FOR_CONTEXT[contextType] : undefined;

    const attachments = (params.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.mimeType ?? null,
      // base64 → bytes without decoding the whole thing twice.
      size: Math.floor((a.content.length * 3) / 4) - (a.content.endsWith("==") ? 2 : a.content.endsWith("=") ? 1 : 0),
      objectPath: null as string | null,
    }));

    const [row] = await db
      .insert(emailDeliveries)
      .values({
        companyId,
        userId: params.userId ?? null,
        toAddresses: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        provider: outcome.provider ?? null,
        providerMessageId: outcome.messageId ?? null,
        status: outcome.status,
        statusDetail: outcome.detail ?? null,
        contextType,
        contextId,
        // Table name is from the fixed map above, never from input.
        projectId: projectTable && contextId
          ? sql`(SELECT project_id FROM ${sql.identifier(projectTable)} WHERE id = ${contextId} LIMIT 1)`
          : null,
        fromAddress: outcome.fromAddress ?? null,
        replyTo: params.replyTo ?? null,
        htmlBody: redacted ? null : params.html ?? null,
        bodyRedacted: redacted,
        attachments,
      } as any)
      .returning({ id: emailDeliveries.id, companyId: emailDeliveries.companyId });

    if (row?.id && companyId && params.attachments?.length) {
      // Not awaited: storing the copy must not slow the send it belongs to.
      void storeAttachmentCopies(row.id, companyId, params.attachments, attachments);
    }
    if (row?.id && outcome.status === "failed" && contextType && BACKGROUND_CONTEXT_TYPES.has(contextType)) {
      void notifySenderOfProblem(row.id);
    }
    return row?.id;
  } catch (err: any) {
    console.error("[email] failed to record delivery:", err?.message);
    return undefined;
  }
}

async function storeAttachmentCopies(
  deliveryId: string,
  companyId: string,
  source: SendEmailAttachment[],
  recorded: Array<{ filename: string; contentType: string | null; size: number; objectPath: string | null }>,
): Promise<void> {
  try {
    const crypto = await import("crypto");
    const { ObjectStorageService } = await import("../replit_integrations/object_storage");
    const { db } = await import("../db");
    const { eq } = await import("drizzle-orm");
    const { emailDeliveries } = await import("@shared/schema");
    const oss = new ObjectStorageService();
    const now = Date.now();
    for (const [key, entry] of Array.from(recentAttachmentUploads)) {
      if (now - entry.at > ATTACHMENT_DEDUPE_MS) recentAttachmentUploads.delete(key);
    }

    const stored = await Promise.all(source.map(async (a, i) => {
      if (recorded[i].size > MAX_STORED_ATTACHMENT_BYTES) return recorded[i];
      const bytes = Buffer.from(a.content, "base64");
      const hash = `${companyId}:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
      const hit = recentAttachmentUploads.get(hash);
      if (hit) return { ...recorded[i], objectPath: hit.path };
      const path = await oss.uploadObjectEntity(bytes, a.mimeType || "application/octet-stream", companyId);
      recentAttachmentUploads.set(hash, { path, at: Date.now() });
      return { ...recorded[i], objectPath: path };
    }));

    await db.update(emailDeliveries).set({ attachments: stored } as any).where(eq(emailDeliveries.id, deliveryId));
  } catch (err: any) {
    // The email went; only the archived copy is missing, and the row says so
    // (objectPath stays null and the log shows "not kept").
    console.error("[email] failed to store attachment copy:", err?.message);
  }
}

/**
 * Tell whoever sent it that an email did not arrive. Once per row — Resend
 * retries webhooks, and a bounce that notifies three times teaches people to
 * ignore it. Used for bounces/complaints (from the webhook) and for failures of
 * background sends nobody was watching.
 */
export async function notifySenderOfProblem(deliveryId: string): Promise<void> {
  try {
    const { db } = await import("../db");
    const { and, eq, isNull } = await import("drizzle-orm");
    const { emailDeliveries } = await import("@shared/schema");
    const { storage } = await import("../storage");

    // Claim the notification atomically, so two concurrent webhook deliveries
    // cannot both send it.
    const [row] = await db
      .update(emailDeliveries)
      .set({ senderNotifiedAt: new Date() } as any)
      .where(and(eq(emailDeliveries.id, deliveryId), isNull(emailDeliveries.senderNotifiedAt)))
      .returning();
    if (!row || !row.userId || !row.companyId) return;

    const to = (row.toAddresses ?? []).join(", ") || "the recipient";
    const what = row.status === "complained" ? "was marked as spam by" : row.status === "failed" ? "could not be sent to" : "bounced from";
    const notification = await storage.createNotification({
      userId: row.userId,
      companyId: row.companyId,
      type: "email_problem",
      title: `Email ${what} ${to}`,
      message: [row.subject, row.statusDetail].filter(Boolean).join(" — ") || null,
      link: `/emails?id=${row.id}`,
      entityType: "email_delivery",
      entityId: row.id,
      isRead: false,
      createdByUserId: null,
    } as any);
    try {
      const { emitNotification } = await import("../socketManager");
      emitNotification(row.userId, notification);
    } catch {
      // Live push is a nicety; the notification is already stored.
    }
  } catch (err: any) {
    console.error("[email] failed to notify sender:", err?.message);
  }
}

export async function sendGenericEmail(params: SendGenericEmailParams) {
  console.log(`📧 Attempting to send email to ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`);

  try {
    const result = await sendEmailWithFallback(params);

    console.log(`✅ Email sent via ${result.sentVia}!`);
    console.log(`   Message ID: ${result.messageId}`);

    // "sent" means a provider accepted the request and nothing more. Delivery
    // is decided later, by the receiving server, and only reaches us by webhook.
    const deliveryId = await recordDelivery(params, {
      provider: result.sentVia,
      messageId: result.messageId,
      fromAddress: result.fromAddress,
      status: "sent",
    });
    return { id: result.messageId, sentVia: result.sentVia, deliveryId };
  } catch (error: any) {
    console.error('❌ Error sending email:');
    console.error(`   Error message: ${error.message}`);
    // A hard failure previously left no trace at all — the only evidence was a
    // line in the server log nobody was reading.
    await recordDelivery(params, { status: "failed", detail: error?.message?.slice(0, 500) });
    throw error;
  }
}
