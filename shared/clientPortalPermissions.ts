/**
 * Client portal permissions.
 *
 * Clients get their OWN permission keys (`portal.*`) rather than sharing the
 * team's `projects.*` keys. The team keys describe builder work — add, edit,
 * delete, approve a variation as the builder — and a tick meant for a client
 * role could never be told apart from one meant for staff. With separate keys:
 *
 *   - a client role can only ever hold `portal.*` keys, and a team/supplier
 *     role never does (enforced on save in routes.ts);
 *   - every action is named for what the CLIENT does ("Choose an option",
 *     "Sign"), which is what the Roles & Permissions client panel renders;
 *   - the server gate (server/middleware/clientAccess.ts) and the client nav
 *     (client/src/lib/clientSections.ts) read only these keys.
 *
 * Seeded by storage.ensureBuiltInPermissionsExist; existing client roles are
 * translated from their old `projects.*` grants on the boot that first creates
 * the keys (storage.backfillClientPortalGrants).
 */

export type PortalPermissionAction = "view" | "add" | "edit" | "approve" | "send";

export const CLIENT_PORTAL_CATEGORY = "client_portal";

export const PORTAL_KEYS = {
  schedule: "portal.schedule",
  scheduleAllItems: "portal.schedule.all_items",
  selections: "portal.selections",
  selectionsPricing: "portal.selections.pricing",
  allowances: "portal.allowances",
  allowancesCosts: "portal.allowances.costs",
  variations: "portal.variations",
  invoices: "portal.invoices",
  reviews: "portal.reviews",
  messages: "portal.messages",
  siteDiary: "portal.site_diary",
} as const;

export interface PortalPermissionDefinition {
  key: string;
  name: string;
  description: string;
  actions: PortalPermissionAction[];
}

/** The catalogue rows. Order is the order the Roles page shows them in. */
export const CLIENT_PORTAL_PERMISSIONS: PortalPermissionDefinition[] = [
  { key: PORTAL_KEYS.schedule, name: "Client — Schedule", description: "See the project schedule (read only)", actions: ["view"] },
  { key: PORTAL_KEYS.scheduleAllItems, name: "Client — Schedule: every item", description: "See every schedule item, not just the top-level phases", actions: ["view"] },
  { key: PORTAL_KEYS.selections, name: "Client — Selections", description: "See selections; choose an option (edit) and comment (add)", actions: ["view", "add", "edit"] },
  { key: PORTAL_KEYS.selectionsPricing, name: "Client — Selection prices", description: "See option prices where the selection allows it", actions: ["view"] },
  { key: PORTAL_KEYS.allowances, name: "Client — Allowances", description: "See the list of PC and PS allowances", actions: ["view"] },
  { key: PORTAL_KEYS.allowancesCosts, name: "Client — Allowance costs", description: "See an allowance's costs once it is finalised", actions: ["view"] },
  { key: PORTAL_KEYS.variations, name: "Client — Variations", description: "See sent variations; sign to approve or reject (approve)", actions: ["view", "approve"] },
  { key: PORTAL_KEYS.invoices, name: "Client — Progress claims", description: "See sent progress claims and payments", actions: ["view"] },
  { key: PORTAL_KEYS.reviews, name: "Client — Reviews", description: "See reviews; comment (add) and give a decision (approve)", actions: ["view", "add", "approve"] },
  { key: PORTAL_KEYS.messages, name: "Client — Messages", description: "See project message channels they are in; post (send)", actions: ["view", "send"] },
  { key: PORTAL_KEYS.siteDiary, name: "Client — Site diary", description: "See site diary entries", actions: ["view"] },
];

export const isPortalPermissionKey = (key: string | null | undefined): boolean =>
  typeof key === "string" && key.startsWith("portal.");

/**
 * Starting point for a new built-in Client role. Allowance COSTS and every
 * schedule item are opt-in: a client sees phases and no allowance money until
 * the builder decides otherwise.
 */
export const DEFAULT_CLIENT_PORTAL_GRANTS: Record<string, PortalPermissionAction[]> = {
  [PORTAL_KEYS.schedule]: ["view"],
  [PORTAL_KEYS.selections]: ["view", "add", "edit"],
  [PORTAL_KEYS.allowances]: ["view"],
  [PORTAL_KEYS.variations]: ["view", "approve"],
  [PORTAL_KEYS.invoices]: ["view"],
  [PORTAL_KEYS.reviews]: ["view", "add", "approve"],
  [PORTAL_KEYS.messages]: ["view", "send"],
  [PORTAL_KEYS.siteDiary]: ["view"],
};

/**
 * Translate a client role's legacy `projects.*` grants into portal grants.
 * Behaviour-preserving where a mapping exists; where the old key conflated two
 * things (selections covered allowances too) both portal keys are granted.
 * Selection APPROVE is deliberately not carried over — the builder confirms a
 * client's choice (Jed, 2026-09-17). Signing variations becomes possible for
 * any client who could see them, matching the emailed link.
 */
export function translateLegacyClientGrants(
  legacy: Record<string, string[]>,
): Record<string, PortalPermissionAction[]> {
  const has = (key: string, action: string) => (legacy[key] ?? []).includes(action);
  const out: Record<string, PortalPermissionAction[]> = {};
  const add = (key: string, actions: PortalPermissionAction[]) => {
    out[key] = Array.from(new Set([...(out[key] ?? []), ...actions]));
  };

  if (has("projects.schedule", "view")) add(PORTAL_KEYS.schedule, ["view"]);
  if (has("projects.selections", "view")) {
    add(PORTAL_KEYS.selections, ["view", "add", "edit"]);
    add(PORTAL_KEYS.allowances, ["view"]);
  }
  if (has("projects.variations", "view")) add(PORTAL_KEYS.variations, ["view", "approve"]);
  if (has("projects.invoices", "view")) add(PORTAL_KEYS.invoices, ["view"]);
  if (has("projects.reviews", "view")) {
    add(PORTAL_KEYS.reviews, ["view"]);
    if (has("projects.reviews", "add")) add(PORTAL_KEYS.reviews, ["add"]);
    if (has("projects.reviews", "approve")) add(PORTAL_KEYS.reviews, ["approve"]);
  }
  if (has("projects.messages", "view")) {
    add(PORTAL_KEYS.messages, ["view"]);
    if (has("projects.messages", "send") || has("projects.messages", "add")) add(PORTAL_KEYS.messages, ["send"]);
  }
  if (has("projects.site_diary", "view")) add(PORTAL_KEYS.siteDiary, ["view"]);
  return out;
}

// ── Roles & Permissions panel ───────────────────────────────────────────────

export interface PortalToggle {
  key: string;
  action: PortalPermissionAction;
  label: string;
  hint?: string;
}

export interface PortalSection {
  id: string;
  title: string;
  /** The "can see this section" toggle. Turning it off clears the others. */
  view: PortalToggle;
  /** Further abilities, only available while the section is visible. */
  extras: PortalToggle[];
}

export const CLIENT_PORTAL_SECTIONS: PortalSection[] = [
  {
    id: "schedule",
    title: "Schedule",
    view: { key: PORTAL_KEYS.schedule, action: "view", label: "See the schedule", hint: "Read only" },
    extras: [
      { key: PORTAL_KEYS.scheduleAllItems, action: "view", label: "Show every item", hint: "Off: top-level phases only" },
    ],
  },
  {
    id: "selections",
    title: "Selections",
    view: { key: PORTAL_KEYS.selections, action: "view", label: "See selections" },
    extras: [
      { key: PORTAL_KEYS.selections, action: "edit", label: "Choose an option", hint: "You still confirm it" },
      { key: PORTAL_KEYS.selections, action: "add", label: "Comment" },
      { key: PORTAL_KEYS.selectionsPricing, action: "view", label: "See prices", hint: "Only on selections set to show price" },
    ],
  },
  {
    id: "allowances",
    title: "Allowances",
    view: { key: PORTAL_KEYS.allowances, action: "view", label: "See the allowance list" },
    extras: [
      { key: PORTAL_KEYS.allowancesCosts, action: "view", label: "See costs", hint: "Only once an allowance is finalised" },
    ],
  },
  {
    id: "variations",
    title: "Variations",
    view: { key: PORTAL_KEYS.variations, action: "view", label: "See sent variations" },
    extras: [
      { key: PORTAL_KEYS.variations, action: "approve", label: "Sign to approve or reject" },
    ],
  },
  {
    id: "invoices",
    title: "Progress claims",
    view: { key: PORTAL_KEYS.invoices, action: "view", label: "See sent claims and payments" },
    extras: [],
  },
  {
    id: "reviews",
    title: "Reviews",
    view: { key: PORTAL_KEYS.reviews, action: "view", label: "See reviews sent to them" },
    extras: [
      { key: PORTAL_KEYS.reviews, action: "add", label: "Comment" },
      { key: PORTAL_KEYS.reviews, action: "approve", label: "Approve or request changes" },
    ],
  },
  {
    id: "messages",
    title: "Messages",
    view: { key: PORTAL_KEYS.messages, action: "view", label: "See channels they're added to" },
    extras: [
      { key: PORTAL_KEYS.messages, action: "send", label: "Post messages" },
    ],
  },
  {
    id: "site-diary",
    title: "Site diary",
    view: { key: PORTAL_KEYS.siteDiary, action: "view", label: "See site diary entries" },
    extras: [],
  },
];
