import { format, formatDistanceToNow, isPast, isToday, isTomorrow, isYesterday } from "date-fns";

/**
 * Shared formatting utilities used across all list pages.
 *
 * Conventions:
 *   - Money in this codebase is stored as integer CENTS in Postgres.
 *     Use `formatCurrency(cents)` everywhere — it converts to dollars
 *     internally. If you have a value already in dollars, pass
 *     `{ fromDollars: true }`.
 *   - Dates are formatted as "d MMM yyyy" by default (Australian style).
 */

export interface FormatCurrencyOptions {
  /** Pass an amount that is already in dollars (skip the /100 conversion). */
  fromDollars?: boolean;
  /** ISO 4217 currency code. Defaults to "AUD". */
  currency?: string;
  /** BCP-47 locale tag. Defaults to "en-AU". */
  locale?: string;
  /** Force a fixed number of fraction digits regardless of the amount. */
  fractionDigits?: number;
}

/**
 * Format a money value as a localised currency string.
 * Always shows two decimal places (`$1,234.00`) unless overridden via
 * `fractionDigits`.
 */
export function formatCurrency(
  amount: number | null | undefined,
  opts: FormatCurrencyOptions = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const dollars = opts.fromDollars ? amount : amount / 100;
  return new Intl.NumberFormat(opts.locale ?? "en-AU", {
    style: "currency",
    currency: opts.currency ?? "AUD",
    minimumFractionDigits: opts.fractionDigits ?? 2,
    maximumFractionDigits: opts.fractionDigits ?? 2,
  }).format(dollars);
}

/** Format a plain number with thousands separators. */
export function formatNumber(
  value: number | null | undefined,
  opts: { fractionDigits?: number; locale?: string } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(opts.locale ?? "en-AU", {
    minimumFractionDigits: opts.fractionDigits ?? 0,
    maximumFractionDigits: opts.fractionDigits ?? 2,
  }).format(value);
}

/** Format a fraction (0-1) or percentage (0-100) as a percent string. */
export function formatPercent(
  value: number | null | undefined,
  opts: { fractionDigits?: number; fromFraction?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const pct = opts.fromFraction ? value * 100 : value;
  const digits = opts.fractionDigits ?? (pct % 1 === 0 ? 0 : 1);
  return `${pct.toFixed(digits)}%`;
}

/**
 * Parse a date input safely. Date-only ISO strings ("2026-04-22") are
 * interpreted as LOCAL midnight to avoid the off-by-one shift caused by
 * `new Date("2026-04-22")` parsing as UTC.
 */
function toDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  // Date-only ISO ("YYYY-MM-DD") — parse as local midnight.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(date);
}

/**
 * Format a date as a short Australian-style string.
 * Default format: "d MMM yyyy" (e.g. "5 Jun 2026").
 * Returns "—" for null/undefined values.
 */
export function formatDate(
  date: Date | string | null | undefined,
  fmt: string = "d MMM yyyy",
): string {
  if (!date) return "—";
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, fmt);
}

/** Short time-of-day, e.g. "9:30 AM". */
export function formatTime(date: Date | string | null | undefined): string {
  return formatDate(date, "h:mm a");
}

/** Combined date + time, e.g. "5 Jun 2026, 9:30 AM". */
export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, "d MMM yyyy, h:mm a");
}

export type RelativeDateBucket =
  | "overdue"
  | "today"
  | "tomorrow"
  | "yesterday"
  | "upcoming"
  | "past"
  | "none";

export interface RelativeDateInfo {
  bucket: RelativeDateBucket;
  /** A short human label suitable for tables ("Today", "Tomorrow", "5 Jun"). */
  label: string;
  /** True when the date is past and the resource is not yet completed. */
  isOverdue: boolean;
}

/**
 * Classify a date relative to "now" and produce a short label.
 * Pass `completed: true` to suppress "overdue" classification.
 */
export function getRelativeDate(
  date: Date | string | null | undefined,
  opts: { completed?: boolean } = {},
): RelativeDateInfo {
  if (!date) return { bucket: "none", label: "—", isOverdue: false };
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return { bucket: "none", label: "—", isOverdue: false };

  if (isToday(d)) return { bucket: "today", label: "Today", isOverdue: false };
  if (isTomorrow(d)) return { bucket: "tomorrow", label: "Tomorrow", isOverdue: false };
  if (isYesterday(d)) return { bucket: "yesterday", label: "Yesterday", isOverdue: !opts.completed };

  if (isPast(d)) {
    return {
      bucket: opts.completed ? "past" : "overdue",
      label: formatDate(d),
      isOverdue: !opts.completed,
    };
  }

  return { bucket: "upcoming", label: formatDate(d), isOverdue: false };
}

/** "in 3 days" / "5 minutes ago" — wraps date-fns `formatDistanceToNow`. */
export function formatRelativeDistance(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Strip a redundant leading actor token from an activity description.
 * The activity feed already renders the actor's name in bold before the
 * description, so descriptions that also start with "User " (literal) or
 * with the actor's own name are shown twice.  This function removes that
 * leading prefix so the line reads cleanly, e.g.:
 *   "User created estimate 'X'"  → "created estimate 'X'"
 *   "Jane Smith updated project" → "updated project"
 */
export function stripActivityActor(
  description: string | null | undefined,
  userName: string | null | undefined,
): string {
  if (!description) return description ?? "";
  if (/^user\s+/i.test(description)) {
    return description.replace(/^user\s+/i, "");
  }
  const actor = userName?.trim();
  if (actor && description.toLowerCase().startsWith(actor.toLowerCase())) {
    const rest = description.slice(actor.length);
    if (rest.startsWith(" ")) return rest.slice(1);
  }
  return description;
}
