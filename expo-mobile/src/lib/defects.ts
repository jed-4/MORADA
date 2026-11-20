import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, apiRequest } from '../services/api';
import { toLocalDateStr } from './dates';

// Defects v2 (stage 1) — types and rules shared by the list, capture and
// detail screens. The contract is docs/DEFECTS_V2.md; the stage names,
// transitions and default due dates below mirror it exactly. The server is
// the authority: these only decide what the phone OFFERS.

export type DefectStage = 'open' | 'sent' | 'accepted' | 'fixed' | 'closed' | 'rejected';
export type JobStage = 'construction' | 'pre_handover' | 'handover' | 'dlp' | 'warranty';
export type PhotoKind = 'before' | 'after' | 'trade';

export interface DefectAttachment {
  url: string;
  name?: string;
  type?: string;
  kind?: PhotoKind;
}

export interface Defect {
  id: string;
  projectId: string;
  projectName?: string | null;
  number?: number | null;
  ref?: string | null;
  title: string;
  description?: string | null;
  stage: DefectStage;
  jobStage: JobStage;
  priority?: string | null;
  trade?: string | null;
  location?: string | null;
  locationId?: string | null;
  assignedContactId?: string | null;
  assignedContactName?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  dueDate?: string | null;
  dateIdentified?: string | null;
  closedAt?: string | null;
  closedByName?: string | null;
  /** Stage 2 trade stamps (server sets them; never money). */
  sentToTradeAt?: string | null;
  tradeViewedAt?: string | null;
  tradeMarkedFixedAt?: string | null;
  attachments?: DefectAttachment[] | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  overdue?: boolean;
  watcherCount?: number;
  isWatching?: boolean;
}

export type DefectEventType =
  | 'created'
  | 'updated'
  | 'transition'
  | 'comment'
  | 'photo'
  | 'watcher_added'
  | 'watcher_removed'
  // Stages 2–3
  | 'sent_to_trade'
  | 'trade_viewed'
  | 'link_revoked'
  | 'backcharge'
  | 'handover_signed';

export interface DefectEvent {
  id: string;
  type: DefectEventType;
  actorUserId?: string | null;
  actorName?: string | null;
  data?: any;
  createdAt: string;
}

export interface DefectDetail extends Defect {
  events?: DefectEvent[];
  watchers?: { userId: string; name?: string | null }[];
}

export type StageCounts = Partial<Record<DefectStage, number>>;

export interface DefectListResponse {
  items: Defect[];
  nextCursor?: string | null;
  counts?: StageCounts;
}

export interface ProjectLocation {
  id: string;
  parentId?: string | null;
  name: string;
  path: string;
  sortOrder?: number;
}

export interface TradeOption {
  key: string;
  name: string;
  color?: string | null;
}

export interface TeamUser {
  id: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

// ── Stages ────────────────────────────────────────────────────────────────

export const STAGE_LABEL: Record<DefectStage, string> = {
  open: 'Open',
  sent: 'Sent to trade',
  accepted: 'Trade accepted',
  fixed: 'Fixed – to check',
  closed: 'Closed',
  rejected: 'Rejected',
};

/** List order: what needs doing first. Rejected sits with "sent" work. */
export const STAGE_ORDER: DefectStage[] = ['open', 'rejected', 'sent', 'accepted', 'fixed', 'closed'];

/** Theme token keys for a stage chip: [text, background]. */
export const STAGE_TONE: Record<DefectStage, ['statusInfo' | 'statusWarning' | 'statusSuccess' | 'statusDanger' | 'primary' | 'textMuted', string]> = {
  open: ['statusInfo', 'statusInfoBg'],
  sent: ['primary', 'primaryLight'],
  accepted: ['primary', 'primaryLight'],
  fixed: ['statusWarning', 'statusWarningBg'],
  closed: ['statusSuccess', 'statusSuccessBg'],
  rejected: ['statusDanger', 'statusDangerBg'],
};

/** Allowed transitions (contract §Workflow). Anything else is a 400. */
export const TRANSITIONS: Record<DefectStage, DefectStage[]> = {
  open: ['sent', 'fixed', 'closed'],
  sent: ['accepted', 'fixed', 'open'],
  accepted: ['fixed', 'open'],
  fixed: ['closed', 'rejected'],
  rejected: ['accepted', 'fixed'],
  closed: ['open'],
};

/** Which permission action a transition needs. Closing and reopening a closed one need `close`. */
export function transitionAction(from: DefectStage, to: DefectStage): 'close' | 'edit' {
  if (to === 'closed') return 'close';
  if (from === 'closed') return 'close';
  return 'edit';
}

/** Button label for moving to `to` (from `from`). */
export function transitionLabel(from: DefectStage, to: DefectStage): string {
  switch (to) {
    case 'sent': return 'Send to trade';
    case 'accepted': return 'Trade accepted';
    case 'fixed': return 'Mark fixed';
    case 'closed': return 'Close';
    case 'rejected': return 'Reject';
    case 'open': return from === 'closed' ? 'Reopen' : 'Back to open';
  }
}

export const isTransitionAllowed = (from: DefectStage, to: DefectStage) => TRANSITIONS[from]?.includes(to) ?? false;

// ── Job stages & due dates ────────────────────────────────────────────────

export const JOB_STAGES: JobStage[] = ['construction', 'pre_handover', 'handover', 'dlp', 'warranty'];

export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  construction: 'Construction',
  pre_handover: 'Pre-handover',
  handover: 'Handover',
  dlp: 'Defects liability',
  warranty: 'Warranty',
};

/** Default days to fix, by job stage (contract §Data). */
export const DEFAULT_DUE_DAYS: Record<JobStage, number> = {
  construction: 14,
  pre_handover: 7,
  handover: 10,
  dlp: 28,
  warranty: 28,
};

/** Default due date (YYYY-MM-DD, local) for a job stage, counted from `from`. */
export function defaultDueDate(jobStage: JobStage, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + DEFAULT_DUE_DAYS[jobStage]);
  return toLocalDateStr(d);
}

// ── Display helpers ───────────────────────────────────────────────────────

/** "D-014" — the server sends `ref`; fall back to the number. */
export function defectRef(d: Pick<Defect, 'ref' | 'number'>): string {
  if (d.ref) return d.ref;
  if (d.number != null) return `D-${String(d.number).padStart(3, '0')}`;
  return 'D-—';
}

export function defaultDefectTitle(location?: string | null): string {
  const loc = (location || '').trim();
  return loc ? `Defect at ${loc}` : 'Defect';
}

export function userName(u: TeamUser | null | undefined): string {
  if (!u) return '';
  return u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Team member';
}

export function isImage(a: DefectAttachment): boolean {
  const t = (a.type || '').toLowerCase();
  if (t.startsWith('image') || t === 'photo') return true;
  if (t && !t.startsWith('image')) return false;
  return /\.(jpe?g|png|heic|webp|gif)(\?|$)/i.test(a.url || a.name || '') || (a.url || '').startsWith('/objects/');
}

/** Photos split by kind. Untagged (older) photos count as "before". */
export function photosByKind(attachments: DefectAttachment[] | null | undefined) {
  const photos = (attachments || []).filter(isImage);
  return {
    before: photos.filter((p) => !p.kind || p.kind === 'before'),
    after: photos.filter((p) => p.kind === 'after'),
    trade: photos.filter((p) => p.kind === 'trade'),
  };
}

/** Group a list into stage sections in STAGE_ORDER, dropping empty ones. */
export function groupByStage(items: Defect[]): { stage: DefectStage; data: Defect[] }[] {
  const byStage = new Map<DefectStage, Defect[]>();
  for (const d of items) {
    const s = (STAGE_ORDER.includes(d.stage) ? d.stage : 'open') as DefectStage;
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s)!.push(d);
  }
  return STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => ({ stage, data: byStage.get(stage)! }));
}

// ── Filters ───────────────────────────────────────────────────────────────

export interface DefectFilters {
  /** Empty = every stage. */
  stages: DefectStage[];
  /** null = every job stage. */
  jobStage: JobStage | null;
  mine: boolean;
  overdue: boolean;
}

export const EMPTY_FILTERS: DefectFilters = { stages: [], jobStage: null, mine: false, overdue: false };

export function filterQuery(f: DefectFilters, extra: { q?: string; ownerUserId?: string; cursor?: string | null } = {}): string {
  const params: string[] = [];
  if (f.stages.length) params.push(`stage=${f.stages.join(',')}`);
  if (f.jobStage) params.push(`jobStage=${f.jobStage}`);
  if (f.mine && extra.ownerUserId) params.push(`ownerUserId=${encodeURIComponent(extra.ownerUserId)}`);
  if (f.overdue) params.push('overdue=1');
  if (extra.q?.trim()) params.push(`q=${encodeURIComponent(extra.q.trim())}`);
  params.push('limit=50');
  if (extra.cursor) params.push(`cursor=${encodeURIComponent(extra.cursor)}`);
  return params.join('&');
}

// ── Reference data for the pickers (kept on disk for offline capture) ─────

export interface DefectRefs {
  locations: ProjectLocation[];
  trades: TradeOption[];
  users: TeamUser[];
}

const refsKey = (projectId: string) => `defects:refs:${projectId}`;

async function readRefs(projectId: string): Promise<DefectRefs | null> {
  try {
    const raw = await AsyncStorage.getItem(refsKey(projectId));
    return raw ? (JSON.parse(raw) as DefectRefs) : null;
  } catch {
    return null;
  }
}

/**
 * Locations, trades and team users for the capture/edit pickers. Each list is
 * fetched fresh when there is signal and saved, so a walkthrough in a
 * basement still has the pickers filled from the last visit.
 */
export async function loadDefectRefs(projectId: string): Promise<DefectRefs> {
  const cached = await readRefs(projectId);
  const [locations, trades, users] = await Promise.all([
    apiFetch<ProjectLocation[]>(`/api/projects/${projectId}/locations`).catch(() => null),
    apiFetch<TradeOption[]>('/api/field-options/defect.trade').catch(() => null),
    apiFetch<TeamUser[]>('/api/users/assignable').catch(() => null),
  ]);
  const refs: DefectRefs = {
    locations: sortLocations(Array.isArray(locations) ? locations : cached?.locations ?? []),
    trades: Array.isArray(trades) ? trades : cached?.trades ?? [],
    users: Array.isArray(users) ? users : cached?.users ?? [],
  };
  if (locations || trades || users) {
    AsyncStorage.setItem(refsKey(projectId), JSON.stringify(refs)).catch(() => {});
  }
  return refs;
}

/** Cached refs only — for painting a picker before the network answers. */
export const readDefectRefs = readRefs;

export function sortLocations(list: ProjectLocation[]): ProjectLocation[] {
  return [...list].sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name, undefined, { numeric: true }));
}

/**
 * Create a location from typed text. "Level 1 > Kitchen > Island" (or › or /)
 * creates each missing level under the one before, reusing levels that
 * already exist by name. Returns the deepest location.
 */
export async function addLocationPath(
  projectId: string,
  text: string,
  existing: ProjectLocation[],
): Promise<{ created: ProjectLocation[]; leaf: ProjectLocation }> {
  const parts = text.split(/\s*(?:›|>|\/)\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Type a location name.');
  const created: ProjectLocation[] = [];
  const all = [...existing];
  let parent: ProjectLocation | null = null;
  for (const name of parts) {
    const parentId: string | null = parent ? parent.id : null;
    const found: ProjectLocation | undefined = all.find(
      (l) => (l.parentId ?? null) === parentId && l.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (found) {
      parent = found;
      continue;
    }
    const res = await apiRequest(`/api/projects/${projectId}/locations`, 'POST', {
      name,
      ...(parentId ? { parentId } : {}),
    });
    const loc = (await res.json()) as ProjectLocation;
    const withPath: ProjectLocation = {
      ...loc,
      path: loc.path || (parent ? `${parent.path} › ${name}` : name),
    };
    created.push(withPath);
    all.push(withPath);
    parent = withPath;
  }
  return { created, leaf: parent! };
}

// ── Trades (stage 2) ──────────────────────────────────────────────────────

/** Stages "Send to trade" works from (open moves to sent; the rest re-send). */
export const SENDABLE_STAGES: DefectStage[] = ['open', 'sent', 'accepted', 'rejected'];

export interface TradeContact {
  id: string;
  label: string;
  email: string | null;
}

/** Company contacts for the trade picker. Online only. */
export async function loadTradeContacts(): Promise<TradeContact[]> {
  const rows = await apiFetch<any[]>('/api/contacts');
  return (Array.isArray(rows) ? rows : [])
    .filter((c) => c && c.id)
    .map((c) => ({ id: String(c.id), label: String(c.company?.trim() || c.name || 'Unnamed'), email: c.email ?? null }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface SendToTradeResult {
  contactName: string;
  sent: number;
  emailed: boolean;
  emailError: string | null;
  defect?: DefectDetail;
}

/** POST /api/defects/:id/send-to-trade — moves open → sent, optional email now. */
export async function sendDefectToTrade(
  defectId: string,
  body: { contactId?: string; emailNow: boolean },
): Promise<SendToTradeResult> {
  const res = await apiRequest(`/api/defects/${defectId}/send-to-trade`, 'POST', body);
  return (await res.json()) as SendToTradeResult;
}

/** "Sent 12 Nov · Viewed 13 Nov · Fixed by trade 14 Nov" — or null if never sent. */
export function tradeStatusLine(d: Pick<Defect, 'sentToTradeAt' | 'tradeViewedAt' | 'tradeMarkedFixedAt'>): string | null {
  if (!d.sentToTradeAt) return null;
  const f = (v: string) => new Date(v).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return [
    `Sent ${f(d.sentToTradeAt)}`,
    d.tradeViewedAt ? `Viewed ${f(d.tradeViewedAt)}` : 'Not viewed yet',
    d.tradeMarkedFixedAt ? `Fixed by trade ${f(d.tradeMarkedFixedAt)}` : null,
  ].filter(Boolean).join(' · ');
}

// ── @mentions in comments ─────────────────────────────────────────────────

/** The "@partial" being typed at the end of the text, or null. */
export function activeMentionQuery(text: string): string | null {
  const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(text);
  return m ? m[1] : null;
}

/** Team users matching the partial name (first 6). */
export function mentionSuggestions(users: TeamUser[], query: string): TeamUser[] {
  const q = query.trim().toLowerCase();
  return users
    .filter((u) => !q || userName(u).toLowerCase().split(/\s+/).some((part) => part.startsWith(q)) || userName(u).toLowerCase().startsWith(q))
    .slice(0, 6);
}

/** Replace the trailing "@partial" with "@Full Name ". */
export function insertMention(text: string, user: TeamUser): string {
  return text.replace(/(^|\s)@([^\s@]{0,30})$/, (_m, pre) => `${pre}@${userName(user)} `);
}

/** Ids of picked users whose "@Name" is still in the text when it's sent. */
export function mentionIdsInText(text: string, picked: TeamUser[]): string[] {
  const ids = new Set<string>();
  for (const u of picked) if (text.includes(`@${userName(u)}`)) ids.add(u.id);
  return Array.from(ids);
}
