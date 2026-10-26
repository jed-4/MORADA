// Asset register: the vocabulary and the "what's due" maths, shared by the
// schema, the routes and both clients. Pure — no db, no React.
//
// Dates are 'YYYY-MM-DD' keys throughout (like the cashflow registers), never
// Date objects, so a due date can't slide a day between the server's clock and
// an AEST browser.

export const ASSET_TYPES = ["vehicle", "trailer", "plant", "tool"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  vehicle: "Vehicle",
  trailer: "Trailer",
  plant: "Plant",
  tool: "Tool",
};

// Archived is the normal way out. Delete exists, but it takes the history with it.
export const ASSET_STATUSES = ["active", "off_road", "sold", "archived"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  off_road: "Off road",
  sold: "Sold",
  archived: "Archived",
};

export const METER_TYPES = ["km", "hours", "none"] as const;
export type MeterType = (typeof METER_TYPES)[number];
export const METER_UNIT: Record<MeterType, string> = { km: "km", hours: "hrs", none: "" };

export const AU_STATES = ["NSW", "QLD", "VIC", "ACT", "SA", "WA", "TAS", "NT"] as const;

// Every expiring thing on an asset is one row with a kind. NSW buys CTP (the
// green slip) separately and needs a pink slip on most vehicles over 5 years
// old, so those are their own kinds rather than notes on the rego.
export const COMPLIANCE_KINDS = [
  "rego",
  "ctp",
  "insurance",
  "safety_check",
  "finance",
  "warranty",
  "test_tag",
  "custom",
] as const;
export type ComplianceKind = (typeof COMPLIANCE_KINDS)[number];
export const COMPLIANCE_KIND_LABELS: Record<ComplianceKind, string> = {
  rego: "Registration",
  ctp: "CTP / green slip",
  insurance: "Insurance",
  safety_check: "Safety check (pink/blue slip)",
  finance: "Finance / lease end",
  warranty: "Warranty",
  test_tag: "Test & tag",
  custom: "Other",
};

export const ASSET_EVENT_KINDS = ["service", "repair", "meter", "note", "assignment", "status"] as const;
export type AssetEventKind = (typeof ASSET_EVENT_KINDS)[number];
export const ASSET_EVENT_KIND_LABELS: Record<AssetEventKind, string> = {
  service: "Service",
  repair: "Repair",
  meter: "Meter reading",
  note: "Note",
  assignment: "Assignment",
  status: "Status change",
};
/** The kinds a person logs by hand. Assignment and status rows are written by the server. */
export const MANUAL_EVENT_KINDS = ["service", "repair", "meter", "note"] as const;

export const ASSET_DOCUMENT_CATEGORIES = ["rego", "insurance", "service", "manual", "purchase", "photo", "other"] as const;
export type AssetDocumentCategory = (typeof ASSET_DOCUMENT_CATEGORIES)[number];
export const ASSET_DOCUMENT_CATEGORY_LABELS: Record<AssetDocumentCategory, string> = {
  rego: "Rego papers",
  insurance: "Insurance",
  service: "Service record",
  manual: "Manual",
  purchase: "Purchase",
  photo: "Photo",
  other: "Other",
};

/**
 * Over 4.5t GVM is a heavy vehicle: NHVR daily checks and Chain of
 * Responsibility apply, even to a builder's tipper.
 */
export const HEAVY_VEHICLE_GVM_KG = 4500;
export function isHeavyVehicle(gvmKg: number | null | undefined): boolean {
  return typeof gvmKg === "number" && gvmKg > HEAVY_VEHICLE_GVM_KG;
}

// ---- dates ---------------------------------------------------------------

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date key in the given IANA zone (default Sydney), not the server's. */
export function todayKey(timeZone = "Australia/Sydney", now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonthsKey(key: string, months: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// ---- due status ----------------------------------------------------------

export type DueState = "overdue" | "due_soon" | "ok";

/** Inside this many days counts as due soon. Matches the 30-day reminder pass. */
export const DUE_SOON_DAYS = 30;
/** Inside this much meter counts as due soon. */
export const DUE_SOON_METER: Record<MeterType, number> = { km: 1000, hours: 25, none: 0 };

const STATE_RANK: Record<DueState, number> = { overdue: 0, due_soon: 1, ok: 2 };

function stateForDays(days: number): DueState {
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

export interface ComplianceDue {
  state: DueState;
  daysLeft: number;
}

export function complianceDue(item: { expiryDate: string }, today: string): ComplianceDue {
  const daysLeft = daysBetween(today, item.expiryDate);
  return { state: stateForDays(daysLeft), daysLeft };
}

export interface ServiceScheduleLike {
  everyMeter: number | null;
  everyMonths: number | null;
  lastDoneMeter: number | null;
  lastDoneDate: string | null;
}

export interface ServiceDue {
  state: DueState;
  /** Null when the schedule has no month interval, or nothing to count from. */
  dueDate: string | null;
  daysLeft: number | null;
  /** Null when the schedule has no meter interval, or nothing to count from. */
  dueMeter: number | null;
  meterLeft: number | null;
  /** Never done and no starting point — the schedule can't be worked out yet. */
  unknown: boolean;
}

/**
 * A service falls due on the meter OR the calendar, whichever comes first
 * (how Fleetio and Samsara both model it). A schedule that has never been done
 * counts from the asset's purchase date, if known.
 */
export function serviceDue(
  schedule: ServiceScheduleLike,
  asset: { meterType: string; currentMeter: number | null; purchaseDate?: string | null },
  today: string,
): ServiceDue {
  const meterType = (METER_TYPES as readonly string[]).includes(asset.meterType) ? (asset.meterType as MeterType) : "none";

  let dueDate: string | null = null;
  let daysLeft: number | null = null;
  const fromDate = schedule.lastDoneDate ?? asset.purchaseDate ?? null;
  if (schedule.everyMonths && fromDate) {
    dueDate = addMonthsKey(fromDate, schedule.everyMonths);
    daysLeft = daysBetween(today, dueDate);
  }

  let dueMeter: number | null = null;
  let meterLeft: number | null = null;
  if (meterType !== "none" && schedule.everyMeter) {
    dueMeter = (schedule.lastDoneMeter ?? 0) + schedule.everyMeter;
    if (asset.currentMeter != null) meterLeft = dueMeter - asset.currentMeter;
  }

  const states: DueState[] = [];
  if (daysLeft != null) states.push(stateForDays(daysLeft));
  if (meterLeft != null) {
    states.push(meterLeft < 0 ? "overdue" : meterLeft <= DUE_SOON_METER[meterType] ? "due_soon" : "ok");
  }
  const state = states.sort((a, b) => STATE_RANK[a] - STATE_RANK[b])[0] ?? "ok";

  return { state, dueDate, daysLeft, dueMeter, meterLeft, unknown: states.length === 0 };
}

export interface AssetDueSummary {
  state: DueState;
  overdue: number;
  dueSoon: number;
  /** The most pressing item, for a one-line "next due" cell. */
  next: { label: string; dueDate: string | null; daysLeft: number | null; meterLeft: number | null; state: DueState } | null;
}

/** Rolls an asset's compliance items and service schedules into one status. */
export function assetDueSummary(
  asset: { meterType: string; currentMeter: number | null; purchaseDate?: string | null },
  items: { kind: string; label: string | null; expiryDate: string }[],
  schedules: (ServiceScheduleLike & { label: string })[],
  today: string,
): AssetDueSummary {
  type Candidate = NonNullable<AssetDueSummary["next"]> & { sortDays: number };
  const candidates: Candidate[] = [];

  for (const item of items) {
    const due = complianceDue(item, today);
    candidates.push({
      label: item.label || COMPLIANCE_KIND_LABELS[item.kind as ComplianceKind] || item.kind,
      dueDate: item.expiryDate,
      daysLeft: due.daysLeft,
      meterLeft: null,
      state: due.state,
      sortDays: due.daysLeft,
    });
  }
  for (const s of schedules) {
    const due = serviceDue(s, asset, today);
    if (due.unknown) continue;
    candidates.push({
      label: s.label,
      dueDate: due.dueDate,
      daysLeft: due.daysLeft,
      meterLeft: due.meterLeft,
      state: due.state,
      // A meter-only schedule has no date to sort on; rank it by state alone.
      sortDays: due.daysLeft ?? (due.state === "ok" ? Number.MAX_SAFE_INTEGER : -1),
    });
  }

  candidates.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.sortDays - b.sortDays);
  const top = candidates[0];
  return {
    state: top?.state ?? "ok",
    overdue: candidates.filter((c) => c.state === "overdue").length,
    dueSoon: candidates.filter((c) => c.state === "due_soon").length,
    next: top ? { label: top.label, dueDate: top.dueDate, daysLeft: top.daysLeft, meterLeft: top.meterLeft, state: top.state } : null,
  };
}

/** A display name when the user left Name blank: "2021 Toyota Hilux". */
export function defaultAssetName(a: { year?: number | null; make?: string | null; model?: string | null; rego?: string | null }): string {
  const parts = [a.year ? String(a.year) : null, a.make, a.model].filter(Boolean);
  return parts.length ? parts.join(" ") : a.rego || "Untitled asset";
}

/** Rego plates are compared and stored upper-case without spaces. */
export function normaliseRego(rego: string | null | undefined): string | null {
  const r = (rego ?? "").replace(/\s+/g, "").toUpperCase();
  return r || null;
}
