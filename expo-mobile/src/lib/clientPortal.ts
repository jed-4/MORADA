/**
 * Client mode — the rules behind what a homeowner sees in the app.
 *
 * Mirrors the web client portal (client/src/pages/client/*) so the phone and
 * the browser say the same thing about the same job. Pure TypeScript, no React
 * Native imports, so it runs under tsx:  npx tsx src/lib/clientPortal.test.ts
 *
 * Presentation only: the server's clientAccessGate (server/middleware/
 * clientAccess.ts) decides what a client may read or do, and shapes every
 * payload. Nothing here stands in for that.
 */

import { dateStrOf, fromLocalDateStr, toLocalDateStr } from './dates';

/** Keep in sync with shared/clientPortalPermissions.ts PORTAL_KEYS. */
export const PORTAL_KEYS = {
  schedule: 'portal.schedule',
  selections: 'portal.selections',
  allowances: 'portal.allowances',
  variations: 'portal.variations',
  invoices: 'portal.invoices',
  reviews: 'portal.reviews',
  messages: 'portal.messages',
  siteDiary: 'portal.site_diary',
} as const;

export type ClientTone = 'done' | 'info' | 'waiting' | 'attention';
export interface ClientStatus {
  label: string;
  tone: ClientTone;
}

// ── Schedule ──────────────────────────────────────────────────────────────

export interface ClientScheduleItem {
  id: string;
  name: string;
  type?: string | null;
  status?: string | null;
  startDate: string;
  endDate: string;
  progressPercent?: number | null;
  parentItemId?: string | null;
  groupName?: string | null;
  sortOrder?: number | null;
  order?: number | null;
}

/**
 * DONE OR NOT — nothing else (Jed's call for the web portal). A builder's
 * "on hold" or "delayed" means nothing useful to a homeowner reading it
 * against their kitchen; the dates say the rest.
 */
export const isScheduleItemDone = (item: ClientScheduleItem) =>
  item.status === 'completed' || (item.progressPercent ?? 0) >= 100;

/** Underway = started and not finished, said with dates, not a builder status. */
export function isScheduleItemUnderway(item: ClientScheduleItem, today: Date = new Date()): boolean {
  if (isScheduleItemDone(item)) return false;
  const day = toLocalDateStr(today);
  return dateStrOf(item.startDate) <= day && dateStrOf(item.endDate) >= day;
}

export interface ScheduleGroup {
  title: string;
  items: ClientScheduleItem[];
  done: number;
}

/** Grouped by phase, in date order within each — same as the web list. */
export function groupSchedule(items: ClientScheduleItem[]): ScheduleGroup[] {
  const sorted = [...items].sort((a, b) => {
    const byDate = dateStrOf(a.startDate).localeCompare(dateStrOf(b.startDate));
    if (byDate !== 0) return byDate;
    return (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0);
  });
  const byGroup = new Map<string, ClientScheduleItem[]>();
  for (const item of sorted) {
    const key = item.groupName || 'Programme';
    byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
  }
  return Array.from(byGroup, ([title, rows]) => ({
    title,
    items: rows,
    done: rows.filter(isScheduleItemDone).length,
  }));
}

export function schedulePercent(items: ClientScheduleItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter(isScheduleItemDone).length / items.length) * 100);
}

/** The online (or locked) schedule is the one the client is shown. */
export function pickSchedule<T extends { status?: string | null }>(schedules: T[]): T | undefined {
  return schedules.find((s) => s.status === 'online' || s.status === 'locked') ?? schedules[0];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 3 Nov 2026" from any API date. */
export function formatDay(value: string | null | undefined): string {
  const s = dateStrOf(value);
  if (!s) return '';
  const d = fromLocalDateStr(s);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "3 Nov – 14 Nov 2026", or a single day when start and end match. */
export function formatDateRange(start: string, end: string): string {
  const a = dateStrOf(start);
  const b = dateStrOf(end);
  if (!a || !b) return formatDay(start || end);
  if (a === b) return formatDay(a);
  const da = fromLocalDateStr(a);
  const db = fromLocalDateStr(b);
  return `${da.getDate()} ${MONTHS[da.getMonth()]} – ${db.getDate()} ${MONTHS[db.getMonth()]} ${db.getFullYear()}`;
}

/** "Mar 2026 – Nov 2026" across every item, for the header. */
export function scheduleSpan(items: ClientScheduleItem[]): string | undefined {
  const days = items.flatMap((i) => [dateStrOf(i.startDate), dateStrOf(i.endDate)]).filter(Boolean).sort();
  if (days.length === 0) return undefined;
  const a = fromLocalDateStr(days[0]);
  const b = fromLocalDateStr(days[days.length - 1]);
  return `${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

// ── Variations / selections / invoices / reviews (status only) ────────────

export interface ClientVariation {
  id: string;
  variationNumber: string;
  name: string;
  totalAmount: number;
  status: string;
  approvalDeadline?: string | null;
}

export const variationStatus = (v: ClientVariation): ClientStatus => {
  if (v.status === 'approved') return { label: 'Approved', tone: 'done' };
  if (v.status === 'rejected') return { label: 'Declined', tone: 'attention' };
  return { label: 'Awaiting your approval', tone: 'waiting' };
};

export interface ClientSelection {
  id: string;
  name: string;
  status: string;
  deadline?: string | null;
  options?: Array<{ approvedAt?: string | null; isSelectedByClient?: boolean | null }>;
}

export const selectionStatus = (s: ClientSelection): ClientStatus => {
  const options = s.options ?? [];
  if (options.some((o) => o.approvedAt) || ['approved', 'ordered', 'received', 'completed'].includes(s.status)) {
    return { label: 'Confirmed', tone: 'done' };
  }
  if (options.some((o) => o.isSelectedByClient)) return { label: 'Your choice sent', tone: 'info' };
  return { label: 'Choose an option', tone: 'waiting' };
};

export type SelectionFilter = 'all' | 'to-choose' | 'sent' | 'confirmed';

/** Which filter bucket a selection falls in — mirrors the web gallery. */
export function selectionFilterOf(s: ClientSelection): Exclude<SelectionFilter, 'all'> {
  const { label } = selectionStatus(s);
  return label === 'Choose an option' ? 'to-choose' : label === 'Your choice sent' ? 'sent' : 'confirmed';
}

export interface SelectionGalleryGroup<T extends ClientSelection> {
  title: string;
  data: T[];
}

/**
 * Filter, search and group the gallery. Waiting-on-you first within each
 * group — the reason a client opens the page — then by name. `groupBy`
 * reads room or category; a blank one lands in "Everything else", last.
 */
export function buildSelectionGallery<T extends ClientSelection & { room?: string | null; category?: string | null }>(
  selections: T[],
  opts: { filter: SelectionFilter; query: string; groupBy: 'room' | 'category' },
): SelectionGalleryGroup<T>[] {
  const term = opts.query.trim().toLowerCase();
  const rank = { 'to-choose': 0, sent: 1, confirmed: 2 } as const;
  const matched = selections
    .filter((s) => opts.filter === 'all' || selectionFilterOf(s) === opts.filter)
    .filter((s) =>
      !term ||
      [s.name, s.room, s.category, ...(s.options ?? []).map((o: any) => o.name)]
        .some((f) => (f ?? '').toLowerCase().includes(term)),
    )
    .sort((a, b) => rank[selectionFilterOf(a)] - rank[selectionFilterOf(b)] || a.name.localeCompare(b.name));

  const OTHER = 'Everything else';
  const groups = new Map<string, T[]>();
  for (const s of matched) {
    const key = (opts.groupBy === 'room' ? s.room : s.category)?.trim() || OTHER;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return Array.from(groups, ([title, data]) => ({ title, data })).sort((a, b) => {
    if (a.title === OTHER) return 1;
    if (b.title === OTHER) return -1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Whether the client can still pick: nothing confirmed by the builder, and
 * the builder hasn't switched "client can change" off. The server enforces
 * the same (isSelectionLockedForClient) and refuses otherwise.
 */
export function canClientChoose(
  s: ClientSelection & { clientCanChange?: boolean | null },
): boolean {
  return selectionStatus(s).tone !== 'done' && s.clientCanChange !== false;
}

export interface ClientInvoice {
  id: string;
  invoiceNumber?: string | null;
  name: string;
  dueDate?: string | null;
  totalAmount: number;
  balanceAmount?: number | null;
  status: string;
}

export function invoiceStatus(inv: ClientInvoice, today: Date = new Date()): ClientStatus {
  if (inv.status === 'paid') return { label: 'Paid', tone: 'done' };
  const due = dateStrOf(inv.dueDate);
  const overdue = inv.status === 'overdue' || (!!due && due < toLocalDateStr(today));
  if (inv.status === 'partial') {
    return { label: overdue ? 'Part paid · overdue' : 'Part paid', tone: overdue ? 'attention' : 'info' };
  }
  return overdue ? { label: 'Overdue', tone: 'attention' } : { label: 'Due', tone: 'waiting' };
}

// ── "Needs your attention" ────────────────────────────────────────────────

export type AttentionKind = 'variation' | 'selection' | 'invoice';

export interface AttentionItem {
  kind: AttentionKind;
  id: string;
  title: string;
  detail: string;
  /** YYYY-MM-DD the builder wants it by, when there is one. */
  dueDate?: string;
  urgent: boolean;
}

/**
 * Everything waiting on the client, most pressing first: overdue or past its
 * deadline, then by deadline, then variations before selections before
 * invoices (a variation is holding up work on site; an invoice is not).
 */
export function buildAttention(
  input: { variations?: ClientVariation[]; selections?: ClientSelection[]; invoices?: ClientInvoice[] },
  today: Date = new Date(),
): AttentionItem[] {
  const todayStr = toLocalDateStr(today);
  const items: AttentionItem[] = [];

  for (const v of input.variations ?? []) {
    if (variationStatus(v).tone !== 'waiting') continue;
    const due = dateStrOf(v.approvalDeadline) || undefined;
    items.push({
      kind: 'variation',
      id: v.id,
      title: `${v.variationNumber ? `${v.variationNumber} · ` : ''}${v.name}`,
      detail: 'Variation to approve',
      dueDate: due,
      urgent: !!due && due < todayStr,
    });
  }
  for (const s of input.selections ?? []) {
    if (selectionStatus(s).tone !== 'waiting') continue;
    const due = dateStrOf(s.deadline) || undefined;
    items.push({
      kind: 'selection',
      id: s.id,
      title: s.name,
      detail: 'Selection to choose',
      dueDate: due,
      urgent: !!due && due < todayStr,
    });
  }
  for (const inv of input.invoices ?? []) {
    const st = invoiceStatus(inv, today);
    if (st.tone === 'done') continue;
    const due = dateStrOf(inv.dueDate) || undefined;
    items.push({
      kind: 'invoice',
      id: inv.id,
      title: inv.invoiceNumber ? `${inv.invoiceNumber} · ${inv.name}` : inv.name,
      detail: st.label === 'Due' ? 'Progress claim due' : `Progress claim ${st.label.toLowerCase()}`,
      dueDate: due,
      urgent: st.tone === 'attention',
    });
  }

  const kindRank: Record<AttentionKind, number> = { variation: 0, selection: 1, invoice: 2 };
  return items.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
    return kindRank[a.kind] - kindRank[b.kind];
  });
}

// ── Site diary ────────────────────────────────────────────────────────────

export interface ClientDiaryEntry {
  id: string;
  title: string;
  templateName?: string | null;
  entryDateTime: string;
  fieldValues?: Record<string, unknown> | null;
  overallPhotos?: Array<string | { url?: string; name?: string }> | null;
  createdByName?: string | null;
}

export const diaryPhotoUrls = (entry: ClientDiaryEntry): string[] =>
  (entry.overallPhotos ?? [])
    .map((p) => (typeof p === 'string' ? p : p?.url ?? ''))
    .filter(Boolean);

/** Field values are a template-shaped bag; show the plain-text ones. */
export const diaryTextFields = (entry: ClientDiaryEntry): Array<[string, string]> =>
  Object.entries(entry.fieldValues ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    .slice(0, 6) as Array<[string, string]>;

/** Newest first. */
export const sortDiary = (entries: ClientDiaryEntry[]) =>
  [...entries].sort((a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime());
