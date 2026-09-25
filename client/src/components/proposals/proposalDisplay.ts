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

/**
 * What a proposal's PDF is called, wherever it leaves the app — the Download
 * menu, the emailed attachment, and the copy frozen at send time.
 *
 *   Dame Edna's Penthouse Makeover Bathroom Refit - Rev B.pdf
 *
 * The proposal number is a fine primary key and a poor filename: a folder of
 * PROP-2026-0001.pdf tells you nothing without opening them. Project first
 * because that is how they get filed.
 *
 * Parts that are missing are dropped rather than left as a gap, so a proposal
 * with no project still gets a sensible name.
 */
export function proposalFileName(input: {
  projectName?: string | null;
  proposalName?: string | null;
  version?: number | null;
  /** Last resort when there is no project and no name. */
  proposalNumber?: string | null;
}): string {
  const head = [input.projectName, input.proposalName]
    .map((part) => safeFilePart(part))
    .filter(Boolean)
    .join(" ");
  const stem = head || safeFilePart(input.proposalNumber) || "proposal";
  return `${stem} - ${revisionLabel(input.version)}.pdf`;
}

/**
 * Trim a name down to something every operating system will accept.
 *
 * Windows refuses \ / : * ? " < > | outright, and a name ending in a dot or a
 * space is silently mangled. Nothing here should be able to produce a file the
 * person then cannot save.
 */
function safeFilePart(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "")
    .slice(0, 80);
}
