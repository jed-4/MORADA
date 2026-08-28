/**
 * Optional layers on the Business → Calendar.
 *
 * Beyond the core ring (tasks and schedule items) the app is full of dated things
 * that have never had a calendar surface: deliveries landing, quotes closing,
 * answers owed, client decisions due. Each is genuinely useful and none of them
 * belongs on by default — nine of them at once is a wall, not a calendar. So they
 * are per-layer toggles, off unless asked for, persisted in the saved view.
 *
 * One registry, shared, so the toggle the user clicks, the layer the server
 * queries, and the colour the chip draws in cannot drift apart.
 *
 * Layers name a palette *token* rather than a hex. Colour is presentation: the
 * server has no business knowing it, and hard-coding hexes here would drift the
 * moment the palette moves — which it did, in #94. The client resolves the token
 * through `TYPE_COLORS_HEX`.
 *
 * Tokens come from the existing type palette rather than new hues — a calendar
 * with fifteen distinct colours reads as noise — so layers that mean similar
 * things deliberately share one.
 */

export type BusinessCalendarLayerKey =
  | "deliveries"
  | "rfqs"
  | "rfis"
  | "selections"
  | "defects"
  | "invoices"
  | "timesheets"
  | "site_diary";

export interface BusinessCalendarLayer {
  key: BusinessCalendarLayerKey;
  /** Toggle label. */
  label: string;
  /** What the date on the chip actually means — shown as the toggle's tooltip. */
  description: string;
  /** A key of `TYPE_COLORS_HEX`, resolved to a hex by the client. */
  colorToken: "task" | "milestone" | "inspection" | "delivery" | "meeting" | "leave";
  /**
   * True for layers that record what already happened rather than what is coming.
   * They read as history on the grid, and are never "overdue".
   */
  lookback?: boolean;
  /**
   * Permission key required to see this layer at all. Enforced on the server; the
   * client only uses it to grey the toggle out.
   */
  permission?: { key: string; action: "view" };
}

export const BUSINESS_CALENDAR_LAYERS: BusinessCalendarLayer[] = [
  {
    key: "deliveries",
    label: "Deliveries",
    description: "Purchase orders by their required-by date",
    colorToken: "delivery",
  },
  {
    key: "rfqs",
    label: "RFQs closing",
    description: "Quote requests by the date responses are due",
    colorToken: "milestone",
  },
  {
    key: "rfis",
    label: "RFIs owed",
    description: "Information requests by the date an answer is due",
    colorToken: "milestone",
  },
  {
    key: "selections",
    label: "Client selections",
    description: "Selections by the date the client has to decide",
    colorToken: "task",
  },
  {
    key: "defects",
    label: "Defects",
    description: "Defects by the date they are due to be resolved",
    colorToken: "meeting",
  },
  {
    key: "invoices",
    label: "Invoices due",
    description: "Client invoices by their due date",
    colorToken: "inspection",
    // Commercial figures on a screen the whole team opens — gated behind the same
    // permission as the revenue KPIs rather than merely hidden in the UI.
    permission: { key: "dashboard.financial", action: "view" },
  },
  {
    key: "timesheets",
    label: "Timesheets",
    description: "Hours actually worked — planned against actual",
    colorToken: "milestone",
    lookback: true,
  },
  {
    key: "site_diary",
    label: "Site diary",
    description: "Site diary entries, on the day they record",
    colorToken: "inspection",
    lookback: true,
  },
];

const BY_KEY = new Map(BUSINESS_CALENDAR_LAYERS.map((l) => [l.key, l]));

export function getLayer(key: string): BusinessCalendarLayer | undefined {
  return BY_KEY.get(key as BusinessCalendarLayerKey);
}

/** Parse a `?layers=a,b,c` parameter, discarding anything unrecognised. */
export function parseLayerKeys(raw: string | null | undefined): BusinessCalendarLayerKey[] {
  if (!raw) return [];
  const seen = new Set<BusinessCalendarLayerKey>();
  for (const part of String(raw).split(",")) {
    const key = part.trim();
    if (BY_KEY.has(key as BusinessCalendarLayerKey)) seen.add(key as BusinessCalendarLayerKey);
  }
  return Array.from(seen);
}

/** One dated row from a layer, as the calendar renders it. */
export interface BusinessCalendarLayerEvent {
  id: string;
  layer: BusinessCalendarLayerKey;
  title: string;
  /** ISO timestamp. Day-granular layers sit at local midnight of their date. */
  date: string;
  /** "HH:mm" when the source has a time of day; null for date-only rows. */
  startTime: string | null;
  endTime: string | null;
  projectId: string | null;
  projectName: string | null;
  status: string | null;
  /** Where clicking through should go. */
  href: string | null;
}
