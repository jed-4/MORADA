import { formatDistanceToNow } from "date-fns";

/**
 * Convert a proposal/estimate version number to a human-friendly revision
 * label: 1 → "Rev A", 2 → "Rev B", … 26 → "Rev Z", 27+ → "Rev 27".
 */
export function revisionLabel(version: number | null | undefined): string {
  const v = Math.max(1, Number(version || 1));
  if (v <= 26) return `Rev ${String.fromCharCode(64 + v)}`;
  return `Rev ${v}`;
}

/**
 * Build the tooltip text shown on the proposal "Seen" indicator (both the
 * list-page column and the detail-page header chip), e.g.
 * "Viewed 3 times · Last 2 hours ago · on iPhone".
 */
export function formatViewedTooltip(
  count: number,
  lastViewedAt: string | Date | null | undefined,
  device: string | null | undefined,
): string {
  if (!count || count <= 0) return "Not viewed yet";
  const relative = lastViewedAt
    ? formatDistanceToNow(new Date(lastViewedAt), { addSuffix: true })
    : null;
  const lastSegment = relative
    ? `Last ${relative}${device ? ` on ${device}` : ""}`
    : device
    ? `on ${device}`
    : null;
  return [
    `Viewed ${count} time${count === 1 ? "" : "s"}`,
    lastSegment,
  ]
    .filter(Boolean)
    .join(" · ");
}
