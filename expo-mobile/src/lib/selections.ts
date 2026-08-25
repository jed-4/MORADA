/**
 * Selections on mobile — types and derivation.
 *
 * The phone is a spec sheet: it answers "what is going in this room?" for
 * whoever is standing in it. That shapes everything here — selections group by
 * ROOM, and a row leads with the chosen product rather than the slot it fills.
 *
 * Money and unapproved selections are stripped SERVER-side by
 * server/selectionVisibility.ts according to the caller's role, so every money
 * field below is optional and a row may arrive as a `restricted` stub. Nothing
 * in this file re-implements that gate; it only renders what arrived.
 */

export interface OptionAttachment {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  thumbnailX?: number | null;
  thumbnailY?: number | null;
}

export interface SelectionOption {
  id: string;
  selectionId: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  brand?: string | null;
  quantity: number;
  unitType: string;
  url?: string | null;
  notes?: string | null;
  specifications?: Record<string, any> | null;
  isSelectedByClient: boolean;
  approvedAt?: string | null;
  approvedBy?: string | null;
  attachments?: OptionAttachment[];
  /** Present only for viewers permitted to see costs. */
  totalCost?: number | null;
  unitCost?: number | null;
  markupPercent?: number | null;
}

export interface Selection {
  id: string;
  projectId: string;
  name: string;
  category?: string | null;
  room?: string | null;
  description?: string | null;
  status: string;
  deadline?: string | null;
  notes?: string | null;
  options?: SelectionOption[];
  /** Present only for viewers permitted to see costs. */
  allowance?: number | null;
  /**
   * Server marker: this viewer may not see selections that aren't approved
   * yet, so the row arrived as a name and nothing else.
   */
  restricted?: boolean;
}

export type SelectionState = 'approved' | 'ordered' | 'received' | 'awaiting' | 'open';

/**
 * What the row says. `approved` is the gate that matters on site — approval is
 * permission-driven (a client with projects.selections:approve approves their
 * own choice), so an approved option is one that's locked in and safe to
 * order against.
 */
export function getSelectionState(selection: Selection): SelectionState {
  if (selection.restricted) return 'awaiting';
  const status = selection.status ?? '';
  if (status === 'received') return 'received';
  if (status === 'ordered') return 'ordered';
  const options = selection.options ?? [];
  if (options.some((o) => o.approvedAt)) return 'approved';
  if (options.some((o) => o.isSelectedByClient)) return 'awaiting';
  return 'open';
}

export const STATE_LABEL: Record<SelectionState, string> = {
  approved: 'Approved',
  ordered: 'Ordered',
  received: 'Received',
  awaiting: 'Not approved',
  open: 'Not selected',
};

/** True once there is a product to build to. */
export function isSettled(state: SelectionState): boolean {
  return state === 'approved' || state === 'ordered' || state === 'received';
}

/**
 * The product actually going in. Approval wins over the client's raw pick —
 * a pick that hasn't been approved is not yet an answer.
 */
export function getChosenOption(selection: Selection): SelectionOption | undefined {
  const options = selection.options ?? [];
  return options.find((o) => o.approvedAt) ?? options.find((o) => o.isSelectedByClient);
}

export function firstImage(option?: SelectionOption): OptionAttachment | undefined {
  return option?.attachments?.find((a) => a.fileType?.toLowerCase() === 'image');
}

// ── Formatting ────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<string, string> = {
  m2: 'm²',
  sqm: 'm²',
  m3: 'm³',
  lm: 'lm',
  linear_m: 'lm',
  linearm: 'lm',
  ea: 'ea',
  each: 'ea',
  item: 'ea',
  hr: 'hr',
  hour: 'hr',
  day: 'day',
  kg: 'kg',
  l: 'L',
  m: 'm',
};

export function unitLabel(unitType?: string | null): string {
  if (!unitType) return '';
  const key = unitType.toLowerCase().replace(/\s+/g, '_');
  return UNIT_LABELS[key] ?? unitType;
}

/** "14 m²" — the number a trade reads off before ordering. */
export function formatQuantity(option?: SelectionOption): string {
  if (!option) return '';
  const qty = Number(option.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return '';
  const rounded = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
  const unit = unitLabel(option.unitType);
  return unit ? `${rounded} ${unit}` : rounded;
}

/** "Concept Tile & Timber · ZL-100" — brand and code, in that order. */
export function specLine(option?: SelectionOption): string {
  if (!option) return '';
  return [option.brand, option.sku].filter(Boolean).join(' · ');
}

export function formatCents(cents?: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
}

// ── Grouping ──────────────────────────────────────────────────────────────

export interface SelectionGroup {
  title: string;
  data: Selection[];
  settledCount: number;
}

const UNGROUPED = 'Not assigned';

function buildGroups(selections: Selection[], keyOf: (s: Selection) => string): SelectionGroup[] {
  const buckets = new Map<string, Selection[]>();
  for (const selection of selections) {
    const key = keyOf(selection);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(selection);
    else buckets.set(key, [selection]);
  }

  const groups = Array.from(buckets.entries()).map(([title, data]) => ({
    title,
    data: data.slice().sort((a, b) => a.name.localeCompare(b.name)),
    settledCount: data.filter((s) => isSettled(getSelectionState(s))).length,
  }));

  // Alphabetical, except the catch-all bucket which always sinks to the bottom.
  return groups.sort((a, b) => {
    if (a.title === UNGROUPED) return 1;
    if (b.title === UNGROUPED) return -1;
    return a.title.localeCompare(b.title);
  });
}

export function groupByRoom(selections: Selection[]): SelectionGroup[] {
  return buildGroups(selections, (s) => s.room?.trim() || UNGROUPED);
}

export function groupByCategory(selections: Selection[]): SelectionGroup[] {
  return buildGroups(selections, (s) => s.category?.trim() || UNGROUPED);
}

/** Matches name, room, category, and the chosen product's brand/sku/name. */
export function matchesSearch(selection: Selection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const chosen = getChosenOption(selection);
  return [
    selection.name,
    selection.room,
    selection.category,
    chosen?.name,
    chosen?.brand,
    chosen?.sku,
  ].some((field) => field?.toLowerCase().includes(q));
}
