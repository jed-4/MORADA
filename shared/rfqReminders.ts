/**
 * Placeholder substitution for RFQ emails.
 *
 * Shared deliberately: the reminder editor's live preview and the scheduler's
 * outgoing email run the same function, so what you see when editing is what
 * the supplier receives. A separate preview implementation would drift.
 */
import type { Rfq, RfqRecipient } from "./schema";

export interface ReminderContext {
  rfq: Pick<Rfq, "rfqNumber" | "title" | "dueDate">;
  recipient: Pick<RfqRecipient, "supplierName" | "portalToken">;
  senderName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  /** Origin for portal links, e.g. https://app.morada.com.au */
  baseUrl?: string | null;
  /** Injectable so previews and tests aren't clock-dependent. */
  now?: Date;
}

function formatDueDate(value: Date | string | null | undefined): string {
  if (!value) return "no set date";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "no set date";
  // en-AU: suppliers read 3 Mar 2026, not 3/3/2026 or Mar 3.
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysRemaining(dueDate: Date | string | null | undefined, now: Date): string {
  if (!dueDate) return "—";
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return "0";
  return String(days);
}

export function buildReminderValues(ctx: ReminderContext): Record<string, string> {
  const now = ctx.now ?? new Date();
  const portalLink =
    ctx.recipient.portalToken && ctx.baseUrl
      ? `${ctx.baseUrl.replace(/\/$/, "")}/portal/rfq/${ctx.recipient.portalToken}`
      : "";

  return {
    "{{supplier_name}}": ctx.recipient.supplierName || "there",
    "{{rfq_number}}": ctx.rfq.rfqNumber || "",
    "{{rfq_title}}": ctx.rfq.title || "",
    "{{due_date}}": formatDueDate(ctx.rfq.dueDate),
    "{{days_remaining}}": daysRemaining(ctx.rfq.dueDate, now),
    "{{portal_link}}": portalLink,
    "{{sender_name}}": ctx.senderName || "",
    "{{company_name}}": ctx.companyName || "",
    "{{project_name}}": ctx.projectName || "",
  };
}

/**
 * Substitute placeholders. Unknown tokens are left as-is rather than blanked —
 * a typo'd placeholder showing up verbatim in a preview is a visible mistake,
 * whereas silently emptying it hides it until a supplier gets a broken email.
 */
export function renderReminderText(template: string, ctx: ReminderContext): string {
  const values = buildReminderValues(ctx);
  return template.replace(/\{\{[a-z_]+\}\}/g, (match) =>
    Object.prototype.hasOwnProperty.call(values, match) ? values[match] : match,
  );
}

/**
 * When a reminder is due, as an absolute time.
 * Returns null when the trigger can't be evaluated — a before_due reminder on
 * an RFQ with no due date simply never fires rather than firing immediately.
 */
export function reminderDueAt(
  template: { trigger: string; offsetDays: number },
  opts: { sentAt?: Date | string | null; dueDate?: Date | string | null },
): Date | null {
  const toDate = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = typeof v === "string" ? new Date(v) : v;
    return Number.isNaN(d.getTime()) ? null : d;
  };

  if (template.trigger === "after_send") {
    const sent = toDate(opts.sentAt);
    if (!sent) return null;
    return new Date(sent.getTime() + template.offsetDays * 86400000);
  }

  if (template.trigger === "before_due") {
    const due = toDate(opts.dueDate);
    if (!due) return null;
    return new Date(due.getTime() - template.offsetDays * 86400000);
  }

  return null;
}

export function describeTrigger(template: { trigger: string; offsetDays: number }): string {
  if (template.trigger === "before_due") {
    return template.offsetDays === 0
      ? "On the due date"
      : `${template.offsetDays} day${template.offsetDays === 1 ? "" : "s"} before due`;
  }
  return template.offsetDays === 0
    ? "Immediately after sending"
    : `${template.offsetDays} day${template.offsetDays === 1 ? "" : "s"} after sending`;
}
