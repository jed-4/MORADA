import { PDF_ACCENTS, PDF_COLORS } from "./pdfTokens";

/**
 * One status chip palette for every document.
 *
 * Each PDF carried its own. The invoice had five states in Tailwind colours
 * (#dbeafe / #fef3c7 / #dcfce7 / #fee2e2), the purchase order had its own set,
 * the RFQ another — none of them related to the chips in the app, and a
 * "sent" invoice and a "sent" purchase order printed in different blues.
 *
 * The tones map onto the app's accent tokens, and deliberately match the
 * decision StatusBadge made for the screen: **draft is grey, not blue**, which
 * was Jed's call — "draft is blue, it should be grey, it confuses sent".
 */

export interface PdfStatusChip {
  label: string;
  bg: string;
  text: string;
}

type Tone = "neutral" | "info" | "positive" | "caution" | "negative";

/** Washes are opaque: an alpha channel on a PDF border renders green. */
const TONE_PAINT: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: "#F0EFEC", text: "#6B6561" },
  info: { bg: "#EEF2F8", text: "#3E5C86" },
  positive: { bg: PDF_ACCENTS.positiveWash, text: "#3F7D5C" },
  caution: { bg: PDF_ACCENTS.cautionWash, text: "#7A5C24" },
  negative: { bg: PDF_ACCENTS.negativeWash, text: "#8C4636" },
};

/**
 * Status key -> tone. Keys are lowercased and underscores/hyphens normalised,
 * so "in_progress", "in-progress" and "In Progress" all land in one place.
 *
 * Anything unmapped falls back to neutral rather than picking a colour at
 * random — a status nobody has classified should look inert, not alarming.
 */
const TONE_FOR_STATUS: Record<string, Tone> = {
  // Nothing has happened yet.
  draft: "neutral",
  pending: "neutral",
  open: "neutral",
  notstarted: "neutral",

  // In flight.
  sent: "info",
  issued: "info",
  submitted: "info",
  inprogress: "info",
  awaitingapproval: "info",
  partial: "info",

  // Settled well.
  approved: "positive",
  accepted: "positive",
  paid: "positive",
  complete: "positive",
  completed: "positive",
  closed: "positive",
  received: "positive",

  // Needs attention.
  overdue: "caution",
  expiring: "caution",
  onhold: "caution",
  action: "caution",

  // Settled badly.
  rejected: "negative",
  declined: "negative",
  cancelled: "negative",
  canceled: "negative",
  expired: "negative",
  void: "negative",
};

/** "awaiting_approval" -> "awaitingapproval" */
function normalise(status: string): string {
  return status.toLowerCase().replace(/[\s_-]+/g, "");
}

/** "awaiting_approval" -> "Awaiting Approval" */
function titleCase(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusPaint(status?: string | null, label?: string): PdfStatusChip {
  const key = normalise(status || "");
  const tone = TONE_FOR_STATUS[key] ?? "neutral";
  const paint = TONE_PAINT[tone];
  return {
    label: label ?? (status ? titleCase(status) : "—"),
    bg: paint.bg,
    text: paint.text,
  };
}

/** For a document with no workflow status of its own. */
export const NO_STATUS: PdfStatusChip = { label: "", bg: PDF_COLORS.surface, text: PDF_COLORS.inkMuted };
