/**
 * Placeholder substitution and trigger timing for proposal chase emails.
 *
 * Shared deliberately, on the same reasoning as shared/rfqReminders.ts: the
 * reminder editor's live preview and the scheduler's outgoing email run the
 * same functions, so what you see while editing is what the client receives.
 * A separate preview implementation drifts, and you find out via a client.
 *
 * Chasing a client is not chasing a supplier. A supplier who ignores an RFQ
 * costs you one quote; a client who feels hounded costs you the job and the
 * referral. That asymmetry is why the seeded cadence below is two emails
 * rather than four, why the copy asks whether they have questions instead of
 * pressing for a decision, and why chasing is off until switched on per
 * proposal.
 */
import type { Proposal } from "./schema";

export type ProposalReminderTrigger = "after_send" | "before_expiry";

export interface ProposalReminderContext {
  proposal: Pick<Proposal, "id" | "proposalNumber" | "name" | "expiryDate" | "totalAmount">;
  recipientName?: string | null;
  senderName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  /** Origin for the portal link, e.g. https://app.moradaco.com.au */
  baseUrl?: string | null;
  /** The proposal's opaque share token — the client's link is useless without it. */
  shareToken?: string | null;
  /** Injectable so previews and tests aren't clock-dependent. */
  now?: Date;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "no set date";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "no set date";
  // en-AU: a client reads 14 Mar 2026, not 3/14/2026.
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysRemaining(expiry: Date | string | null | undefined, now: Date): string {
  if (!expiry) return "—";
  const d = typeof expiry === "string" ? new Date(expiry) : expiry;
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  return days < 0 ? "0" : String(days);
}

export function buildProposalReminderValues(ctx: ProposalReminderContext): Record<string, string> {
  const now = ctx.now ?? new Date();
  const portalLink =
    ctx.shareToken && ctx.baseUrl
      ? `${ctx.baseUrl.replace(/\/$/, "")}/portal/proposal/${ctx.proposal.id}?token=${encodeURIComponent(ctx.shareToken)}`
      : "";

  return {
    "{{client_name}}": ctx.recipientName || "there",
    "{{proposal_number}}": ctx.proposal.proposalNumber || "",
    "{{proposal_name}}": ctx.proposal.name || "",
    "{{valid_until}}": formatDate(ctx.proposal.expiryDate),
    "{{days_remaining}}": daysRemaining(ctx.proposal.expiryDate, now),
    "{{portal_link}}": portalLink,
    "{{sender_name}}": ctx.senderName || "",
    "{{company_name}}": ctx.companyName || "",
    "{{project_name}}": ctx.projectName || "",
  };
}

/**
 * Substitute placeholders. Unknown tokens are left verbatim rather than
 * blanked — a typo'd placeholder visible in the preview is a mistake you
 * catch, whereas silently emptying it hides it until a client gets an email
 * with a hole in it.
 */
export function renderProposalReminderText(template: string, ctx: ProposalReminderContext): string {
  const values = buildProposalReminderValues(ctx);
  return template.replace(/\{\{[a-z_]+\}\}/g, (match) =>
    Object.prototype.hasOwnProperty.call(values, match) ? values[match] : match,
  );
}

/**
 * When a reminder falls due, as an absolute time.
 *
 * Returns null when the trigger cannot be evaluated — a before_expiry reminder
 * on a proposal with no expiry date never fires, rather than firing at once.
 * Getting that wrong emails every client on the next sweep.
 */
export function proposalReminderDueAt(
  template: { trigger: string; offsetDays: number },
  opts: { sentDate?: Date | string | null; expiryDate?: Date | string | null },
): Date | null {
  const toDate = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = typeof v === "string" ? new Date(v) : v;
    return Number.isNaN(d.getTime()) ? null : d;
  };

  if (template.trigger === "after_send") {
    const sent = toDate(opts.sentDate);
    if (!sent) return null;
    return new Date(sent.getTime() + template.offsetDays * 86400000);
  }

  if (template.trigger === "before_expiry") {
    const expiry = toDate(opts.expiryDate);
    if (!expiry) return null;
    return new Date(expiry.getTime() - template.offsetDays * 86400000);
  }

  return null;
}

export function describeProposalTrigger(template: { trigger: string; offsetDays: number }): string {
  if (template.trigger === "before_expiry") {
    return template.offsetDays === 0
      ? "On the expiry date"
      : `${template.offsetDays} day${template.offsetDays === 1 ? "" : "s"} before it expires`;
  }
  return template.offsetDays === 0
    ? "Immediately after sending"
    : `${template.offsetDays} day${template.offsetDays === 1 ? "" : "s"} after sending`;
}

/** Placeholders offered as chips in the editor, and substituted on send. */
export const PROPOSAL_REMINDER_PLACEHOLDERS = [
  { token: "{{client_name}}", label: "Client name" },
  { token: "{{proposal_number}}", label: "Proposal number" },
  { token: "{{proposal_name}}", label: "Proposal name" },
  { token: "{{valid_until}}", label: "Valid until" },
  { token: "{{days_remaining}}", label: "Days remaining" },
  { token: "{{portal_link}}", label: "Portal link" },
  { token: "{{sender_name}}", label: "Your name" },
  { token: "{{company_name}}", label: "Company name" },
  { token: "{{project_name}}", label: "Project name" },
] as const;

/**
 * Seeded for a company the first time its proposal reminders are opened.
 *
 * Two emails, not four. The first assumes the proposal was missed rather than
 * ignored; the second is information the client actually wants — that a price
 * is about to lapse — rather than another ask. Both offer a way out, because a
 * clear no is worth more than silence.
 */
export const DEFAULT_PROPOSAL_REMINDER_TEMPLATES = [
  {
    name: "Gentle follow-up",
    trigger: "after_send" as const,
    offsetDays: 5,
    subject: "Following up: {{proposal_name}}",
    body:
      "Hi {{client_name}},\n\n" +
      "Just checking our proposal for {{project_name}} reached you alright.\n\n" +
      "You can look through it and accept or decline here: {{portal_link}}\n\n" +
      "If anything needs explaining or you'd like something priced differently, " +
      "just reply to this email and we'll sort it out.\n\n" +
      "Thanks,\n{{sender_name}}\n{{company_name}}",
    displayOrder: 0,
  },
  {
    name: "Price about to lapse",
    trigger: "before_expiry" as const,
    offsetDays: 3,
    subject: "{{proposal_name}} — pricing valid until {{valid_until}}",
    body:
      "Hi {{client_name}},\n\n" +
      "A heads-up that the pricing in our proposal for {{project_name}} holds until " +
      "{{valid_until}}, which is {{days_remaining}} days away.\n\n" +
      "You can accept or decline here: {{portal_link}}\n\n" +
      "If you need more time, that's no problem at all — let us know and we'll " +
      "requote at current rates.\n\n" +
      "Thanks,\n{{sender_name}}\n{{company_name}}",
    displayOrder: 1,
  },
];
