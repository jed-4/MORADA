import { storage } from "../storage";
import { sendGenericEmail } from "../utils/email";
import { renderReminderText, reminderDueAt } from "@shared/rfqReminders";
import type { Rfq, RfqRecipient, RfqReminderTemplate } from "@shared/schema";

/**
 * Chases suppliers who haven't come back on an RFQ.
 *
 * The previous design wrote four rfq_follow_ups rows at send time and nothing
 * ever read them — `getRFQFollowUps` had no caller outside the routes file, so
 * no reminder was ever sent. This is the missing half.
 *
 * Two rules do most of the work:
 *   - only recipients still awaiting a response are chased. A supplier who has
 *     quoted or declined is never emailed again, which is the failure mode that
 *     would actually damage a builder's supplier relationships.
 *   - a reminder is claimed by inserting its log row before the email goes out.
 *     The unique (recipient, template) index makes that the lock, so a retry,
 *     an overlapping tick, or a second process cannot double-send.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly; each reminder fires once
const STARTUP_DELAY_MS = 150_000; // let the app settle before the first sweep

let started = false;

/** Recipients we are still waiting on. */
export function remindableRecipients(recipients: RfqRecipient[]): RfqRecipient[] {
  return recipients.filter(
    (r) => !r.isExternal && !!r.supplierEmail && (r.status === "sent" || r.status === "viewed"),
  );
}

export async function sendRfqReminder({
  rfq,
  recipient,
  template,
  baseUrl,
  senderName,
  companyName,
  projectName,
  force = false,
}: {
  rfq: Rfq;
  recipient: RfqRecipient;
  template: RfqReminderTemplate;
  baseUrl: string;
  senderName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  /** "Send now" from the UI — bypasses the once-only claim. */
  force?: boolean;
}): Promise<{ supplierName: string; status: "sent" | "failed" | "skipped"; error?: string }> {
  if (!recipient.supplierEmail) {
    return { supplierName: recipient.supplierName, status: "skipped", error: "No email address" };
  }

  const ctx = {
    rfq,
    recipient,
    senderName,
    companyName,
    projectName,
    baseUrl,
  };
  const subject = renderReminderText(template.subject, ctx);
  const body = renderReminderText(template.body, ctx);

  // Claim first. On the scheduled path a duplicate claim means another pass
  // already handled it, so we stop rather than send twice.
  let logId: string | null = null;
  if (!force) {
    const claim = await storage.claimRFQReminder({
      rfqId: rfq.id,
      recipientId: recipient.id,
      templateId: template.id,
      subject,
      body,
      toEmail: recipient.supplierEmail,
      status: "sent",
    } as any);
    if (!claim) {
      return { supplierName: recipient.supplierName, status: "skipped", error: "Already sent" };
    }
    logId = claim.id;
  }

  try {
    await sendGenericEmail({
      to: recipient.supplierEmail,
      subject,
      html: body.replace(/\n/g, "<br>"),
      from: `${companyName || "Morada"} via Morada <noreply@moradaco.com.au>`,
      attachments: undefined,
    } as any);

    await storage.updateRFQRecipient(recipient.id, {
      lastRemindedAt: new Date(),
      remindersSent: (recipient.remindersSent ?? 0) + 1,
    } as any);

    return { supplierName: recipient.supplierName, status: "sent" };
  } catch (error: any) {
    // The claim row stays, flipped to failed: a permanently bad address should
    // not be retried every hour forever, and the failure is visible in the log.
    if (logId) await storage.markRFQReminderFailed(logId, error?.message || "Send failed");
    return { supplierName: recipient.supplierName, status: "failed", error: error?.message };
  }
}

async function sweep(): Promise<{ checked: number; sent: number }> {
  const baseUrl = process.env.APP_BASE_URL || "https://app.moradaco.com.au";
  let checked = 0;
  let sent = 0;

  // Only RFQs actually out with suppliers, with chasing switched on.
  const liveRfqs = await storage.getRfqsAwaitingReminders();
  if (liveRfqs.length === 0) return { checked, sent };

  // Grouped by company so templates and settings are fetched once each rather
  // than once per RFQ — Neon is us-east-1 and every round trip costs ~400ms.
  const byCompany = new Map<string, Rfq[]>();
  for (const rfq of liveRfqs) {
    const list = byCompany.get(rfq.companyId);
    if (list) list.push(rfq);
    else byCompany.set(rfq.companyId, [rfq]);
  }

  for (const [companyId, rfqs] of Array.from(byCompany.entries())) {
    let templates: RfqReminderTemplate[];
    try {
      templates = (await storage.getRFQReminderTemplates(companyId)).filter((t) => t.enabled);
    } catch {
      continue;
    }
    if (templates.length === 0) continue;

    const settings = await storage.getCompanySettings(companyId).catch(() => undefined);
    const companyName = settings?.companyName || null;

    for (const rfq of rfqs) {
      checked++;

      let recipients: RfqRecipient[];
      try {
        recipients = remindableRecipients(await storage.getRFQRecipients(rfq.id));
      } catch {
        continue;
      }
      if (recipients.length === 0) continue;

      const project = rfq.projectId
        ? await storage.getProject(rfq.projectId).catch(() => undefined)
        : undefined;

      for (const template of templates) {
        for (const recipient of recipients) {
          const dueAt = reminderDueAt(template, {
            sentAt: recipient.sentAt,
            dueDate: rfq.dueDate,
          });
          // null means this trigger can't be evaluated (e.g. a before_due
          // reminder on an RFQ with no due date) — never fire in that case.
          if (!dueAt || dueAt > new Date()) continue;

          const result = await sendRfqReminder({
            rfq,
            recipient,
            template,
            baseUrl,
            senderName: rfq.ownerName || rfq.createdByName,
            companyName,
            projectName: project?.name ?? null,
          });
          if (result.status === "sent") sent++;
        }
      }
    }
  }

  return { checked, sent };
}

export function startRfqReminderScheduler(): void {
  if (started) return;
  started = true;

  const run = () => {
    sweep()
      .then(({ checked, sent }) => {
        if (sent > 0 || checked > 0) {
          console.log(`[RfqReminders] swept ${checked} RFQ(s), sent ${sent} reminder(s)`);
        }
      })
      .catch((e) => console.error("[RfqReminders]", e));
  };

  setTimeout(run, STARTUP_DELAY_MS);
  setInterval(run, CHECK_INTERVAL_MS);
  console.log("[RfqReminders] scheduler started (hourly sweep)");
}
