/**
 * Defects v2 — the rules every client (web, phone) and the server share.
 * Contract: docs/DEFECTS_V2.md. Pure functions only, so they can be tested
 * without a database.
 */

export const DEFECT_STAGES = ["open", "sent", "accepted", "fixed", "closed", "rejected"] as const;
export type DefectStage = (typeof DEFECT_STAGES)[number];

export const DEFECT_STAGE_LABELS: Record<DefectStage, string> = {
  open: "Open",
  sent: "Sent to trade",
  accepted: "Trade accepted",
  fixed: "Fixed – to check",
  closed: "Closed",
  rejected: "Rejected",
};

export const DEFECT_JOB_STAGES = ["construction", "pre_handover", "handover", "dlp", "warranty"] as const;
export type DefectJobStage = (typeof DEFECT_JOB_STAGES)[number];

export const DEFECT_JOB_STAGE_LABELS: Record<DefectJobStage, string> = {
  construction: "Construction",
  pre_handover: "Pre-handover",
  handover: "Handover",
  dlp: "Defects liability (DLP)",
  warranty: "Warranty",
};

/** Default days until due, by job stage, when no due date is given. */
export const DEFECT_DEFAULT_DUE_DAYS: Record<DefectJobStage, number> = {
  construction: 14,
  pre_handover: 7,
  handover: 10,
  dlp: 28,
  warranty: 28,
};

export const DEFECT_EVENT_TYPES = [
  "created", "updated", "transition", "comment", "photo", "watcher_added", "watcher_removed",
  // Stages 2–3: sent to the trade, trade opened their link, link turned off,
  // backcharge recorded/cleared (no amount in the event — events are visible
  // to everyone who can see the defect), client signed the handover list.
  "sent_to_trade", "trade_viewed", "link_revoked", "backcharge", "handover_signed",
] as const;
export type DefectEventType = (typeof DEFECT_EVENT_TYPES)[number];

export const DEFECT_PHOTO_KINDS = ["before", "after", "trade"] as const;
export type DefectPhotoKind = (typeof DEFECT_PHOTO_KINDS)[number];

export const DEFECT_PERMISSION_KEY = "projects.defects";
export const DEFECT_PERMISSION_ACTIONS = ["view", "add", "edit", "close", "delete"] as const;

export function isDefectStage(v: unknown): v is DefectStage {
  return typeof v === "string" && (DEFECT_STAGES as readonly string[]).includes(v);
}

export function isDefectJobStage(v: unknown): v is DefectJobStage {
  return typeof v === "string" && (DEFECT_JOB_STAGES as readonly string[]).includes(v);
}

/** Allowed next stages from each stage. Anything else is a 400. */
export const DEFECT_TRANSITIONS: Record<DefectStage, readonly DefectStage[]> = {
  open: ["sent", "fixed", "closed"],
  sent: ["accepted", "fixed", "open"],
  accepted: ["fixed", "open"],
  fixed: ["closed", "rejected"],
  rejected: ["accepted", "fixed"],
  closed: ["open"],
};

/**
 * Transitions that need the `close` action, not just `edit`: anything INTO
 * closed (open → closed as well as fixed → closed — otherwise someone without
 * `close` could skip the check by closing straight from open), and reopening.
 */
export function transitionNeedsClose(from: DefectStage, to: DefectStage): boolean {
  return to === "closed" || from === "closed";
}

/** Transitions that need a non-empty note. */
export function transitionNeedsNote(from: DefectStage, to: DefectStage): boolean {
  return from === "fixed" && to === "rejected";
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Can this user move a defect from `from` to `to`?
 * `canEdit` / `canClose` are the caller's `projects.defects` actions.
 */
export function checkDefectTransition(
  from: string,
  to: string,
  opts: { canEdit: boolean; canClose: boolean; note?: string | null },
): TransitionCheck {
  if (!isDefectStage(to)) return { ok: false, status: 400, error: `Unknown stage "${to}"` };
  // A row whose stage is somehow unknown is treated as open — same as the backfill.
  const fromStage: DefectStage = isDefectStage(from) ? from : "open";
  if (fromStage === to) return { ok: false, status: 400, error: `Defect is already ${DEFECT_STAGE_LABELS[to]}` };
  if (!DEFECT_TRANSITIONS[fromStage].includes(to)) {
    return {
      ok: false,
      status: 400,
      error: `Can't move a defect from ${DEFECT_STAGE_LABELS[fromStage]} to ${DEFECT_STAGE_LABELS[to]}`,
    };
  }
  if (transitionNeedsClose(fromStage, to)) {
    if (!opts.canClose) return { ok: false, status: 403, error: "You don't have permission to close or reopen defects" };
  } else if (!opts.canEdit && !opts.canClose) {
    return { ok: false, status: 403, error: "You don't have permission to change this defect" };
  }
  if (transitionNeedsNote(fromStage, to) && !(opts.note ?? "").trim()) {
    return { ok: false, status: 400, error: "Say why it was rejected" };
  }
  return { ok: true };
}

/** The stages this user can move to from `from` (for buttons). */
export function allowedDefectTransitions(
  from: string,
  opts: { canEdit: boolean; canClose: boolean },
): DefectStage[] {
  const fromStage: DefectStage = isDefectStage(from) ? from : "open";
  return DEFECT_TRANSITIONS[fromStage].filter((to) =>
    transitionNeedsClose(fromStage, to) ? opts.canClose : opts.canEdit || opts.canClose,
  );
}

/** stage → legacy `status` column, kept in sync for old reports. */
export function legacyStatusForStage(stage: string): string {
  switch (stage) {
    case "sent":
    case "accepted":
    case "rejected":
      return "in_progress";
    case "fixed":
      return "resolved";
    case "closed":
      return "closed";
    default:
      return "open";
  }
}

/** legacy `status` → stage (the backfill). Unknown custom keys → open. */
export function stageFromLegacyStatus(status: string | null | undefined): DefectStage {
  switch (status) {
    case "in_progress":
      return "sent";
    case "resolved":
      return "fixed";
    case "closed":
      return "closed";
    default:
      return "open";
  }
}

/** Fields a transition writes besides `stage`. */
export function transitionSideEffects(
  to: DefectStage,
  actor: { id: string | null; name: string | null },
  now: Date,
): {
  status: string;
  closedAt: Date | null;
  closedBy: string | null;
  closedByName: string | null;
  dateResolved?: Date | null;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
} {
  const base = { status: legacyStatusForStage(to) };
  if (to === "closed") {
    return { ...base, closedAt: now, closedBy: actor.id, closedByName: actor.name };
  }
  if (to === "fixed") {
    return {
      ...base,
      closedAt: null, closedBy: null, closedByName: null,
      dateResolved: now, resolvedBy: actor.id, resolvedByName: actor.name,
    };
  }
  // Reopened / sent back: clear both the close and the legacy resolved stamp.
  return {
    ...base,
    closedAt: null, closedBy: null, closedByName: null,
    dateResolved: null, resolvedBy: null, resolvedByName: null,
  };
}

/** "D-014". */
export function formatDefectRef(number: number | null | undefined): string {
  if (number == null || !Number.isFinite(number)) return "D-—";
  return `D-${String(Math.trunc(number)).padStart(3, "0")}`;
}

/** Due date when none is given: created + N days for the job stage. */
export function defaultDefectDueDate(jobStage: string | null | undefined, from: Date): Date {
  const days = DEFECT_DEFAULT_DUE_DAYS[isDefectJobStage(jobStage) ? jobStage : "construction"];
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Overdue = past due and not fixed or closed (fixed is waiting on us, not the trade). */
export function isDefectOverdue(
  d: { stage: string; dueDate: Date | string | null | undefined },
  now: Date,
): boolean {
  if (!d.dueDate) return false;
  if (d.stage === "closed" || d.stage === "fixed") return false;
  return new Date(d.dueDate).getTime() < now.getTime();
}

export const LOCATION_PATH_SEPARATOR = " › ";

/** Full "Level 1 › Kitchen › Island" path for every location id. Cycles are cut. */
export function buildLocationPaths(
  rows: Array<{ id: string; parentId: string | null; name: string }>,
): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<string, string>();
  for (const row of rows) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur: typeof row | undefined = row;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    out.set(row.id, parts.join(LOCATION_PATH_SEPARATOR));
  }
  return out;
}

/** Would making `parentId` the parent of `id` create a loop? */
export function locationParentMakesCycle(
  rows: Array<{ id: string; parentId: string | null }>,
  id: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false;
  if (parentId === id) return true;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  let cur = byId.get(parentId);
  while (cur && !seen.has(cur.id)) {
    if (cur.id === id) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/** Who to notify for an event: owner + watchers + mentions, minus the actor. */
export function defectNotifyRecipients(params: {
  actorUserId: string | null;
  ownerUserId: string | null;
  watcherIds: string[];
  mentionIds?: string[];
}): string[] {
  const ids = new Set<string>();
  if (params.ownerUserId) ids.add(params.ownerUserId);
  for (const w of params.watcherIds) if (w) ids.add(w);
  for (const m of params.mentionIds ?? []) if (m) ids.add(m);
  if (params.actorUserId) ids.delete(params.actorUserId);
  return Array.from(ids);
}

/** Field-level diff for an `updated` event: {name: [old, new]}. */
export function diffDefectFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const a = norm(before[k]);
    const b = norm(v);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b];
  }
  return out;
}

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === "") return null;
  return v ?? null;
}

// ── API shapes (what GET /api/projects/:id/defects and /api/defects/:id return) ──

export interface DefectPhoto {
  url: string;
  name: string;
  type?: string;
  kind?: DefectPhotoKind;
}

export interface DefectView {
  id: string;
  projectId: string;
  projectName: string | null;
  number: number | null;
  ref: string;
  title: string;
  description: string | null;
  stage: DefectStage;
  jobStage: string;
  priority: string;
  trade: string | null;
  location: string | null;
  locationId: string | null;
  assignedContactId: string | null;
  assignedContactName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  dateIdentified: string;
  closedAt: string | null;
  closedByName: string | null;
  sentToTradeAt: string | null;
  tradeViewedAt: string | null;
  tradeMarkedFixedAt: string | null;
  attachments: DefectPhoto[];
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  watcherCount: number;
  isWatching: boolean;
  /** Legacy, kept in sync with stage. */
  status: string;
  type: string;
  notes: string | null;
  dateResolved: string | null;
}

export interface DefectEventView {
  id: string;
  defectId: string;
  type: string;
  actorUserId: string | null;
  actorName: string | null;
  data: any;
  createdAt: string;
}

export interface DefectDetailView extends DefectView {
  events: DefectEventView[];
  watchers: Array<{ userId: string; name: string }>;
}

export interface DefectListResponse {
  items: DefectView[];
  nextCursor: string | null;
  counts: Record<DefectStage, number>;
}

export interface ProjectLocationView {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
}
