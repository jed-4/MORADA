import type { MindeeInvoiceData } from "./ocr";

// Email attachment type
export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer | string; // base64 or buffer
  size: number;
}

// Parsed email data
export interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments: EmailAttachment[];
  receivedAt: Date;
}

// Email webhook formats (SendGrid, Mailgun, etc.)
export interface SendGridInboundEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: number;
  attachment1?: string; // base64
  attachment_info?: string; // JSON with attachment metadata
  [key: string]: any;
}

export class EmailParserService {
  /**
   * Parse SendGrid inbound email format
   */
  parseSendGridEmail(data: SendGridInboundEmail): ParsedEmail {
    const attachments: EmailAttachment[] = [];
    
    // SendGrid sends attachments as attachment1, attachment2, etc.
    const attachmentCount = data.attachments || 0;
    
    for (let i = 1; i <= attachmentCount; i++) {
      const attachmentData = data[`attachment${i}`];
      const attachmentInfo = data.attachment_info ? JSON.parse(data.attachment_info) : {};
      
      if (attachmentData) {
        const info = attachmentInfo[`attachment${i}`] || {};
        attachments.push({
          filename: info.filename || `attachment${i}`,
          contentType: info.type || 'application/octet-stream',
          content: attachmentData,
          size: attachmentData.length,
        });
      }
    }

    return {
      from: data.from,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
      attachments,
      receivedAt: new Date(),
    };
  }

  /**
   * Filter attachments to only invoice-like documents (PDF, images)
   */
  filterInvoiceAttachments(attachments: EmailAttachment[]): EmailAttachment[] {
    const validTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
    ];

    return attachments.filter(att => {
      // Check content type
      if (validTypes.includes(att.contentType.toLowerCase())) {
        return true;
      }

      // Check filename extension as fallback
      const ext = att.filename.split('.').pop()?.toLowerCase();
      return ['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext || '');
    });
  }

  /**
   * Extract project hint from email subject or body
   * e.g., "Invoice for Project ABC" or "[ProjectXYZ] Invoice"
   */
  extractProjectHint(email: ParsedEmail): string | null {
    const text = `${email.subject} ${email.text || ''}`.toLowerCase();
    
    // Look for patterns like [PROJECT-NAME] or "project: NAME"
    const bracketMatch = text.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
      return bracketMatch[1];
    }

    const colonMatch = text.match(/project[:\s]+([^\s,\.]+)/i);
    if (colonMatch) {
      return colonMatch[1];
    }

    return null;
  }

  /**
   * Extract supplier hint from email
   */
  extractSupplierHint(email: ParsedEmail): string | null {
    // Try to get supplier from "from" address
    const fromMatch = email.from.match(/<([^>]+)>/);
    const fromEmail = fromMatch ? fromMatch[1] : email.from;
    
    // Extract domain or company name
    const domainMatch = fromEmail.match(/@([^\.]+)/);
    if (domainMatch) {
      return domainMatch[1];
    }

    return null;
  }
}

// Singleton instance
let emailParserService: EmailParserService | null = null;

export function getEmailParserService(): EmailParserService {
  if (!emailParserService) {
    emailParserService = new EmailParserService();
  }
  return emailParserService;
}
