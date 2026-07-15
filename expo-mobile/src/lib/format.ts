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
