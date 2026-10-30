/**
 * What an email_deliveries row MEANS to a person reading the log.
 *
 * Shared by the server (the "needs attention" filter) and the client (the
 * status chip), so the two cannot disagree about which emails are in trouble.
 *
 * The rule this exists to enforce: never show "Sent" as though it were good
 * news. "Sent" only ever meant a provider accepted the request — the email
 * that prompted the whole log was accepted, bounced, and displayed "Sent" for
 * days. So a row is described by what we actually KNOW about it.
 */

/** A Resend email with no delivered/bounced event after this long is suspect. */
export const NO_CONFIRMATION_AFTER_MS = 4 * 60 * 60 * 1000;
/** ...but only recent ones are worth flagging. Older unconfirmed rows predate
 *  delivery tracking working at all, and flagging them would bury real problems. */
export const ATTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type DeliveryTone = "positive" | "info" | "neutral" | "warning" | "negative";

export type DeliveryHealthKey =
  | "failed"
  | "bounced"
  | "complained"
  | "delayed"
  | "opened"
  | "delivered"
  | "sending"
  | "unconfirmed"
  | "gmail_untracked"
  | "untracked";

export interface DeliveryHealth {
  key: DeliveryHealthKey;
  label: string;
  tone: DeliveryTone;
  /** One sentence for a tooltip — what the label does and does not prove. */
  hint: string;
  needsAttention: boolean;
}

export interface DeliveryHealthInput {
  status: string;
  provider?: string | null;
  sentAt: string | Date;
  statusDetail?: string | null;
  openCount?: number | null;
}

export function deliveryHealth(
  row: DeliveryHealthInput,
  opts: { now?: Date; trackingEnabled: boolean },
): DeliveryHealth {
  const now = (opts.now ?? new Date()).getTime();
  const age = now - new Date(row.sentAt).getTime();
  const detail = row.statusDetail ? ` ${row.statusDetail}` : "";

  switch (row.status) {
    case "failed":
      return { key: "failed", label: "Failed", tone: "negative", needsAttention: true,
        hint: `It never left Morada — the mail provider refused the request.${detail}` };
    case "bounced":
      return { key: "bounced", label: "Bounced", tone: "negative", needsAttention: true,
        hint: `The recipient's mail server rejected it. They did not receive it.${detail}` };
    case "complained":
      return { key: "complained", label: "Marked as spam", tone: "negative", needsAttention: true,
        hint: "It arrived, and the recipient reported it as spam. Future emails to them may not arrive." };
    case "delivered":
      if ((row.openCount ?? 0) > 0) {
        return { key: "opened", label: "Opened", tone: "positive", needsAttention: false,
          hint: "Delivered, and opened. Opens are approximate — some mail apps open every message automatically." };
      }
      return { key: "delivered", label: "Delivered", tone: "positive", needsAttention: false,
        hint: "The recipient's mail server accepted it. It may still be in a spam folder." };
  }

  // sent / delayed: nothing confirmed yet.
  if (row.provider === "gmail") {
    return { key: "gmail_untracked", label: "Sent via Gmail", tone: "neutral", needsAttention: false,
      hint: "Sent from the user's own Gmail. Gmail does not report delivery, so a bounce would land in their inbox, not here." };
  }
  if (!opts.trackingEnabled) {
    return { key: "untracked", label: "Sent", tone: "neutral", needsAttention: false,
      hint: "Handed to the mail provider. Delivery tracking is not switched on, so whether it arrived is unknown." };
  }
  const recent = age < ATTENTION_WINDOW_MS;
  if (row.status === "delayed") {
    return { key: "delayed", label: "Delayed", tone: "warning", needsAttention: recent,
      hint: "The recipient's server is not accepting it yet. The provider keeps retrying." };
  }
  if (age > NO_CONFIRMATION_AFTER_MS) {
    return { key: "unconfirmed", label: "No confirmation", tone: "warning", needsAttention: recent,
      hint: "Sent hours ago and the recipient's server has not confirmed it. It may not have arrived." };
  }
  return { key: "sending", label: "Sending", tone: "info", needsAttention: false,
    hint: "Handed to the mail provider moments ago. Delivery is usually confirmed within a minute." };
}

/** Context types → what a person calls them. */
const TYPE_LABELS: Record<string, string> = {
  variation: "Variation",
  proposal: "Proposal",
  proposal_reminder: "Proposal chaser",
  rfq: "RFQ",
  rfq_reminder: "RFQ chaser",
  purchase_order: "Purchase order",
  client_invoice: "Client invoice",
  selection: "Selection",
  review_item: "Review",
  client_decision: "Client decision",
  password_reset: "Password reset",
  team_invite: "Team invite",
  client_portal_invite: "Portal invite",
  reminder: "Reminder",
  bug_report: "Issue report",
  onboarding: "Onboarding",
};

/** Onboarding rows are `onboarding:<key>`; they group as one type. */
export function emailTypeKey(contextType: string | null | undefined): string {
  if (!contextType) return "other";
  return contextType.startsWith("onboarding:") ? "onboarding" : contextType;
}

export function emailTypeLabel(contextType: string | null | undefined): string {
  return TYPE_LABELS[emailTypeKey(contextType)] ?? "Other";
}

export const EMAIL_TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

/** Where the document an email was about lives in the app, or null. */
export function emailContextHref(
  contextType: string | null | undefined,
  contextId: string | null | undefined,
  projectId: string | null | undefined,
): string | null {
  if (!contextId || !projectId) return null;
  const p = `/projects/${projectId}`;
  switch (emailTypeKey(contextType)) {
    case "variation":
    case "client_decision":
      return `${p}/variations/${contextId}`;
    case "proposal":
    case "proposal_reminder":
      return `${p}/proposals/${contextId}`;
    case "rfq":
    case "rfq_reminder":
      return `${p}/rfqs/${contextId}`;
    case "purchase_order":
      return `${p}/purchase-orders/${contextId}`;
    case "client_invoice":
      return `${p}/client-invoices/${contextId}`;
    case "selection":
      return `${p}/selections/${contextId}`;
    case "review_item":
      return `${p}/reviews/${contextId}`;
    default:
      return null;
  }
}

/** One row of the list, as the API returns it. */
export interface EmailLogRow {
  id: string;
  sentAt: string;
  toAddresses: string[];
  subject: string | null;
  provider: string | null;
  status: string;
  statusDetail: string | null;
  statusUpdatedAt: string | null;
  contextType: string | null;
  contextId: string | null;
  contextRef: string | null;
  projectId: string | null;
  projectName: string | null;
  userId: string | null;
  senderName: string | null;
  openCount: number;
  firstOpenedAt: string | null;
  attachmentCount: number;
  resentFromId: string | null;
}

export interface EmailLogListResponse {
  rows: EmailLogRow[];
  nextCursor: string | null;
  /** Whether delivery events can arrive at all. When false, "Sent" is the end of the story. */
  trackingEnabled: boolean;
  /** False when the caller sees only the emails they sent themselves. */
  scopeAll: boolean;
  summary: { total: number; delivered: number; opened: number; attention: number };
}

export interface EmailTimelineEvent {
  at: string;
  kind: "sent" | "failed" | "delayed" | "delivered" | "opened" | "clicked" | "bounced" | "complained"
    | "portal_viewed" | "signed" | "rejected" | "quote_submitted" | "resent";
  label: string;
  detail?: string | null;
  /** True for events that are estimates, not facts (opens). */
  approximate?: boolean;
}

export interface EmailLogDetail extends EmailLogRow {
  fromAddress: string | null;
  replyTo: string | null;
  htmlBody: string | null;
  bodyRedacted: boolean;
  attachments: Array<{ filename: string; contentType: string | null; size: number; stored: boolean }>;
  clickCount: number;
  lastOpenedAt: string | null;
  deliveredAt: string | null;
  timeline: EmailTimelineEvent[];
  resentAs: Array<{ id: string; sentAt: string; toAddresses: string[]; status: string }>;
}

// ── Fixing an address ───────────────────────────────────────────────────────

/** Domain typos common enough to be worth a suggestion. Exact matches only —
 *  a guess about an unfamiliar domain would be worse than no guess. */
const DOMAIN_FIXES: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.com.au": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
  "bigpond.con": "bigpond.com",
  "bigpong.com": "bigpond.com",
  "optusnet.com": "optusnet.com.au",
};

/**
 * A likely correction for an address that bounced, or null.
 *
 * Deliberately narrow. The email that started all this went to
 * `name_@gmail.com` — valid syntax, so no rule could have caught it, and
 * guessing at the local part would put words in a client's mouth. What IS
 * safe to suggest: whitespace, a doubled or trailing dot, a comma for a dot,
 * and the well-known domain typos above.
 */
export function suggestEmailFix(address: string): string | null {
  const original = address;
  let a = address.trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".").replace(/\.{2,}/g, ".").replace(/\.$/, "");
  const at = a.lastIndexOf("@");
  if (at < 1) return null;
  const local = a.slice(0, at).replace(/\.$/, "");
  let domain = a.slice(at + 1);
  domain = DOMAIN_FIXES[domain] ?? domain;
  a = `${local}@${domain}`;
  return a !== original.trim().toLowerCase() ? a : null;
}

/** Loose check, matching what the send routes accept. */
export function isPlausibleEmail(address: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(address.trim());
}

/** An address that has bounced or complained, and not been delivered to since. */
export interface AddressProblem {
  address: string;
  status: "bounced" | "complained";
  detail: string | null;
  at: string;
  deliveryId: string;
}

/**
 * Portal links in client and supplier emails are bearer tokens: whoever holds
 * /portal/variation/<token> can sign as the client. Staff mostly can reach
 * them anyway, but the log is a new place they would sit in plain sight, so
 * the copy SHOWN here has them masked. The stored copy is untouched — a
 * resend must carry the working link.
 *
 * Masks any long token-like path segment or query value in an href, and the
 * same URL wherever it appears as visible text.
 */
export function hideBearerLinks(html: string): string {
  const TOKEN = /[A-Za-z0-9_-]{20,}/g;
  const urls = new Set<string>();
  html.replace(/href\s*=\s*(["'])(.*?)\1/gi, (_m, _q, url: string) => {
    if (TOKEN.test(url)) urls.add(url);
    TOKEN.lastIndex = 0;
    return "";
  });
  let out = html;
  for (const url of Array.from(urls)) {
    const masked = url.replace(TOKEN, "\u2022\u2022\u2022\u2022");
    out = out.split(url).join(masked);
  }
  return out;
}
