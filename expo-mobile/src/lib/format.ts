// Shared display formatters (previously duplicated per-screen with drift).

/** "3m ago" / "2h ago" / "5d ago" / locale date beyond a week. */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** Compact relative time for activity rows: "now", "3m", "2h", "5d", then "12 Nov". */
export function compactAgo(value: string | Date | null | undefined): string {
  return timeAgo(value).replace(/ ago$/, '').replace(/^just now$/, 'now');
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

/** Cents (int, inc GST) → "$1,234.56". The app-wide money convention. */
export function formatCents(cents: number | null | undefined): string {
  const value = (cents || 0) / 100;
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : pluralForm || `${singular}s`;
}

/** Headline money in a few characters: $486k, $1.19m, $950. Takes CENTS. */
export function formatShortCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents === 0) return null;
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? '-' : '';
  // Thresholds sit at the rounding boundary, so $999,600 reads "$1m" (not
  // "$1000k") and $999.60 reads "$1k" (not "$1000").
  if (abs >= 999_500) return `${sign}$${parseFloat((abs / 1_000_000).toFixed(2))}m`;
  if (abs >= 999.5) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Messages list times: 2m, 14m, 1h, 3h, Yesterday, Thu, Mon, 12 Nov, 27 Oct.
 * Under a minute reads "now"; older than a week shows the date.
 */
export function shortWhen(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';
  const now = new Date();
  const mins = Math.floor((now.getTime() - t) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return `${Math.floor(mins / 60)}h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-AU', { weekday: 'short' });
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
