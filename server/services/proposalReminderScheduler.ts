import { storage } from "../storage";
import { sendGenericEmail } from "../utils/email";
import {
  renderProposalReminderText,
  proposalReminderDueAt,
} from "@shared/proposalReminders";
import type { Proposal, ProposalReminderTemplate } from "@shared/schema";

/**
 * Chases a client who hasn't come back on a proposal.
 *
 * Built on the same two rules as the RFQ scheduler, because they are the ones
 * that matter:
 *
 *   - only proposals still awaiting a response are chased. The work list is
 *     filtered in SQL (sent/viewed, not archived, chasing switched on), so a
 *     proposal the client has already accepted or declined can never be
 *     emailed about again. That is the failure mode that actually damages a
 *     builder's relationship with a client.
 *   - a reminder is claimed by inserting its log row BEFORE the email goes
 *     out. The unique (proposal, template, email) index makes that insert the
 *     lock, so a retry, an overlapping hourly tick, or a second app instance
 *     cannot double-send.
 *
 * One deliberate difference from RFQ: chasing is opt-in per proposal
 * (proposals.reminders_enabled, default false). Nobody's client gets an
 * automated email because a default was left switched on.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly; each reminder fires once
const STARTUP_DELAY_MS = 165_000; // let the app settle, and stagger off the RFQ sweep

let started = false;

export async function sendProposalReminder({
  proposal,
  template,
  recipient,
  baseUrl,
  senderName,
  companyName,
  projectName,
  force = false,
}: {
  proposal: Proposal;
  template: ProposalReminderTemplate;
  recipient: { name?: string; email: string };
  baseUrl: string;
  senderName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  /** "Send now" from the UI — bypasses the once-only claim. */
  force?: boolean;
}): Promise<{ email: string; status: "sent" | "failed" | "skipped"; error?: string }> {
  if (!recipient.email) {
    return { email: "", status: "skipped", error: "No email address" };
  }

  const ctx = {
    proposal,
    recipientName: recipient.name ?? null,
    senderName,
    companyName,
    projectName,
    baseUrl,
    shareToken: proposal.shareToken,
  };
  const subject = renderProposalReminderText(template.subject, ctx);
  const body = renderProposalReminderText(template.body, ctx);

  // Claim first. On the scheduled path a duplicate claim means another pass
  // already handled this one, so we stop rather than send twice.
  let logId: string | null = null;
  if (!force) {
    const claim = await storage.claimProposalReminder({
      proposalId: proposal.id,
      templateId: template.id,
      toEmail: recipient.email,
      subject,
      body,
      status: "sent",
    } as any);
    if (!claim) {
      return { email: recipient.email, status: "skipped", error: "Already sent" };
    }
    logId = claim.id;
  }

  try {
    await sendGenericEmail({
      to: recipient.email,
      subject,
      html: body.replace(/\n/g, "<br>"),
      from: `${companyName || "Morada"} via Morada <noreply@moradaco.com.au>`,
    } as any);
    return { email: recipient.email, status: "sent" };
  } catch (error: any) {
    // The claim row stays, flipped to failed: a permanently bad address should
    // not be retried every hour forever, and the failure stays visible in the
    // log rather than disappearing.
    if (logId) await storage.markProposalReminderFailed(logId, error?.message || "Send failed");
    return { email: recipient.email, status: "failed", error: error?.message };
  }
}

async function sweep(): Promise<{ checked: number; sent: number }> {
  const baseUrl = (process.env.APP_BASE_URL || process.env.APP_URL || "https://app.moradaco.com.au")
    .replace(/\/$/, "");
  let checked = 0;
  let sent = 0;

  const live = await storage.getProposalsAwaitingReminders();
  if (live.length === 0) return { checked, sent };

  // Grouped by company so templates and settings are fetched once each rather
  // than once per proposal — Neon is us-east-1 and every round trip is ~400ms.
  const byCompany = new Map<string, Proposal[]>();
  for (const proposal of live) {
    if (!proposal.companyId) continue; // legacy rows with no tenant: nothing to brand the email with
    const list = byCompany.get(proposal.companyId);
    if (list) list.push(proposal);
    else byCompany.set(proposal.companyId, [proposal]);
  }

  for (const [companyId, proposals] of Array.from(byCompany.entries())) {
    let templates: ProposalReminderTemplate[];
    try {
      templates = (await storage.getProposalReminderTemplates(companyId)).filter((t) => t.enabled);
    } catch {
      continue;
    }
    if (templates.length === 0) continue;

    const settings = await storage.getCompanySettings(companyId).catch(() => undefined);
    const companyName = settings?.companyName || null;

    for (const proposal of proposals) {
      checked++;

      // Who it actually went to, captured at send time. A proposal sent before
      // recipients were recorded has nobody to chase — skip rather than guess
      // at the project's current client, who may not be who received it.
      const recipients = (proposal.sentTo ?? []) as Array<{ name?: string; email: string }>;
      if (!Array.isArray(recipients) || recipients.length === 0) continue;

      const project = proposal.projectId
        ? await storage.getProject(proposal.projectId).catch(() => undefined)
        : undefined;

      for (const template of templates) {
        const dueAt = proposalReminderDueAt(template, {
          sentDate: proposal.sentDate,
          expiryDate: proposal.expiryDate,
        });
        // null means the trigger cannot be evaluated — a before_expiry reminder
        // on a proposal with no expiry date. Never fire in that case; firing
        // would email every client on the next sweep.
        if (!dueAt || dueAt > new Date()) continue;

        for (const recipient of recipients) {
          const result = await sendProposalReminder({
            proposal,
            template,
            recipient,
            baseUrl,
            senderName: proposal.createdByName,
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

export function startProposalReminderScheduler(): void {
  if (started) return;
  started = true;

  const run = () => {
    sweep()
      .then(({ checked, sent }) => {
        if (checked > 0 || sent > 0) {
          console.log(`[ProposalReminders] swept ${checked} proposal(s), sent ${sent} reminder(s)`);
        }
      })
      .catch((e) => console.error("[ProposalReminders]", e));
  };

  setTimeout(run, STARTUP_DELAY_MS);
  setInterval(run, CHECK_INTERVAL_MS);
  console.log("[ProposalReminders] scheduler started (hourly sweep)");
}
