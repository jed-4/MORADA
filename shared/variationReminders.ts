/**
 * Placeholder substitution and timing for variation chase emails.
 *
 * Shared on purpose, like shared/proposalReminders.ts: the settings editor and
 * the scheduler run the same functions, so the wording you edit is the wording
 * the client receives.
 *
 * A variation is different from a proposal in one way that shapes the copy:
 * the work is often already happening, so an unsigned variation is a risk to
 * the BUILDER (doing work nobody has agreed to pay for), not a sale going
 * cold. The tone stays friendly — the client is mid-build and living with you
 * — but the reason to sign is stated plainly.
 */

export type VariationReminderTrigger = "after_send" | "before_deadline";

export interface VariationReminderContext {
  variation: {
    variationNumber?: string | null;
    name?: string | null;
    approvalDeadline?: Date | string | null;
  };
  clientName?: string | null;
  senderName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  /** Injectable so previews and tests aren't clock-dependent. */
  now?: Date;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "no set date";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "no set date";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysRemaining(deadline: Date | string | null | undefined, now: Date): string {
  if (!deadline) return "—";
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  return days < 0 ? "0" : String(days);
}

export function buildVariationReminderValues(ctx: VariationReminderContext): Record<string, string> {
  const now = ctx.now ?? new Date();
  return {
    "{{client_name}}": ctx.clientName || "there",
    "{{variation_number}}": ctx.variation.variationNumber || "",
    "{{variation_name}}": ctx.variation.name || "",
    "{{approval_deadline}}": formatDate(ctx.variation.approvalDeadline),
    "{{days_remaining}}": daysRemaining(ctx.variation.approvalDeadline, now),
    "{{sender_name}}": ctx.senderName || "",
    "{{company_name}}": ctx.companyName || "",
    "{{project_name}}": ctx.projectName || "",
  };
}

/** Unknown tokens are left as typed, so a typo shows in the preview instead of a hole in the email. */
export function renderVariationReminderText(template: string, ctx: VariationReminderContext): string {
  const values = buildVariationReminderValues(ctx);
  return template.replace(/\{\{[a-z_]+\}\}/g, (m) =>
    Object.prototype.hasOwnProperty.call(values, m) ? values[m] : m,
  );
}

/**
 * When a step falls due. null = it can't be worked out (a before-deadline step
 * on a variation with no deadline, or one never sent) — and then it never
 * fires, rather than firing at once and emailing every client on the next sweep.
 */
export function variationReminderDueAt(
  template: { trigger: string; offsetDays: number },
  opts: { sentAt?: Date | string | null; approvalDeadline?: Date | string | null },
): Date | null {
  const toDate = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = typeof v === "string" ? new Date(v) : v;
    return Number.isNaN(d.getTime()) ? null : d;
  };
  if (template.trigger === "after_send") {
    const sent = toDate(opts.sentAt);
    return sent ? new Date(sent.getTime() + template.offsetDays * 86400000) : null;
  }
  if (template.trigger === "before_deadline") {
    // Nothing before it was sent, even if the deadline is close.
    if (!toDate(opts.sentAt)) return null;
    const deadline = toDate(opts.approvalDeadline);
    return deadline ? new Date(deadline.getTime() - template.offsetDays * 86400000) : null;
  }
  return null;
}

/**
 * Which step to send now, and which to skip for good.
 *
 * Steps that are due, not yet sent, and not stale (a before-deadline step
 * after the deadline has passed) are candidates. Only the LATEST candidate is
 * sent; earlier ones are skipped — switching chasing on for a variation sent
 * weeks ago must produce one email, not the whole sequence at once.
 */
export function pickVariationReminder<T extends { id: string; trigger: string; offsetDays: number }>(
  templates: T[],
  alreadyLogged: Set<string>,
  opts: { sentAt?: Date | string | null; approvalDeadline?: Date | string | null },
  now: Date,
): { send: T | null; skip: T[] } {
  const deadline = opts.approvalDeadline ? new Date(opts.approvalDeadline) : null;
  const due = templates
    .filter((t) => !alreadyLogged.has(t.id))
    .map((t) => ({ t, at: variationReminderDueAt(t, opts) }))
    .filter((x): x is { t: T; at: Date } => !!x.at && x.at <= now)
    .filter((x) => !(x.t.trigger === "before_deadline" && deadline && deadline < now))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (due.length === 0) return { send: null, skip: [] };
  return { send: due[due.length - 1].t, skip: due.slice(0, -1).map((x) => x.t) };
}

export function describeVariationTrigger(template: { trigger: string; offsetDays: number }): string {
  const n = template.offsetDays;
  if (template.trigger === "before_deadline") {
    return n === 0 ? "On the approval deadline" : `${n} day${n === 1 ? "" : "s"} before the approval deadline`;
  }
  return n === 0 ? "Straight after sending" : `${n} day${n === 1 ? "" : "s"} after sending`;
}

export const VARIATION_REMINDER_PLACEHOLDERS = [
  { token: "{{client_name}}", label: "Client name" },
  { token: "{{variation_number}}", label: "Variation number" },
  { token: "{{variation_name}}", label: "Variation name" },
  { token: "{{approval_deadline}}", label: "Approval deadline" },
  { token: "{{days_remaining}}", label: "Days to deadline" },
  { token: "{{project_name}}", label: "Project name" },
  { token: "{{sender_name}}", label: "Your name" },
  { token: "{{company_name}}", label: "Company name" },
] as const;

/**
 * Seeded for a company the first time its variation reminders are opened.
 * The email itself carries a "Review and approve" button to the portal, so the
 * wording doesn't need a link in it.
 */
export const DEFAULT_VARIATION_REMINDER_TEMPLATES = [
  {
    name: "Friendly nudge",
    trigger: "after_send" as const,
    offsetDays: 3,
    subject: "Variation {{variation_number}} — {{variation_name}}",
    body:
      "Hi {{client_name}},\n\n" +
      "Just checking variation {{variation_number}} ({{variation_name}}) for {{project_name}} reached you.\n\n" +
      "You can look through it and approve it using the button below. If anything needs " +
      "explaining, reply to this email and we'll talk it through.\n\n" +
      "Thanks,\n{{sender_name}}\n{{company_name}}",
    displayOrder: 0,
  },
  {
    name: "Second reminder",
    trigger: "after_send" as const,
    offsetDays: 7,
    subject: "Still waiting on variation {{variation_number}}",
    body:
      "Hi {{client_name}},\n\n" +
      "Variation {{variation_number}} ({{variation_name}}) is still waiting on your approval.\n\n" +
      "We'd like it signed before we go further with this part of the work, so nothing " +
      "goes ahead that you haven't agreed to. If you'd rather change or drop it, just let us know.\n\n" +
      "Thanks,\n{{sender_name}}\n{{company_name}}",
    displayOrder: 1,
  },
  {
    name: "Deadline approaching",
    trigger: "before_deadline" as const,
    offsetDays: 2,
    subject: "Variation {{variation_number}} — approval due {{approval_deadline}}",
    body:
      "Hi {{client_name}},\n\n" +
      "A heads-up that variation {{variation_number}} ({{variation_name}}) needs your approval by " +
      "{{approval_deadline}} — {{days_remaining}} days from now.\n\n" +
      "If you need more time or have questions, reply to this email.\n\n" +
      "Thanks,\n{{sender_name}}\n{{company_name}}",
    displayOrder: 2,
  },
];
