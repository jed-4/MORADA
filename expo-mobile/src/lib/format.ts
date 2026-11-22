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
  if (abs >= 1_000_000) return `${sign}$${parseFloat((abs / 1_000_000).toFixed(2))}m`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}
