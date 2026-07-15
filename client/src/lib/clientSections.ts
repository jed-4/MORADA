/**
 * Which project sections a client-portal user can see.
 *
 * The sidebar keys sections by title ("Site Diary") and the project page keys
 * them by tab id ("site-diary"); this is the one place both vocabularies map to
 * a permission key, so ticking a permission in Roles & Permissions drives the
 * nav and the tabs together.
 *
 * Sections absent from this table have no permission key in the catalogue
 * (Overview, Activity, Scope, Checklists, Defects, Team, Take off, Minutes) and
 * are therefore never shown to a client — deny by default.
 *
 * This is presentation only. The server's clientAccessGate is what actually
 * enforces access; hiding a tab here never stands in for that.
 */

export interface SectionPermission {
  /** Permission key(s) — a client needs `view` on any one of them. */
  keys: string[];
}

/** Project tab id (PROJECT_TAB_GROUPS in CustomizableProjectOverview) → permission. */
export const TAB_PERMISSIONS: Record<string, SectionPermission> = {
  schedule: { keys: ["projects.schedule"] },
  selections: { keys: ["projects.selections"] },
  allowances: { keys: ["projects.selections"] },
  variations: { keys: ["projects.variations"] },
  "client-invoices": { keys: ["projects.invoices"] },
  "site-diary": { keys: ["projects.site_diary"] },
  messages: { keys: ["projects.messages"] },
  notes: { keys: ["projects.notes"] },
  tasks: { keys: ["tasks.project"] },
  rfis: { keys: ["projects.rfi"] },
  rfqs: { keys: ["financial.quotes"] },
  files: { keys: ["files.manage"] },
  estimates: { keys: ["financial.estimate"] },
  proposals: { keys: ["financial.proposal"] },
  bills: { keys: ["financial.bills"] },
  budget: { keys: ["financial.budget_actuals", "financial.budget_labour"] },
  "purchase-orders": { keys: ["financial.purchase_orders"] },
  timesheets: { keys: ["projects.timesheet"] },
};

/** Sidebar item title (projectFlatOrder in SidebarNav) → project tab id. */
export const SIDEBAR_TITLE_TO_TAB: Record<string, string> = {
  Schedule: "schedule",
  Selections: "selections",
  Allowances: "allowances",
  Variations: "variations",
  "Client Invoices": "client-invoices",
  "Site Diary": "site-diary",
  Messages: "messages",
  Notes: "notes",
  Tasks: "tasks",
  RFIs: "rfis",
  RFQs: "rfqs",
  Files: "files",
  Estimates: "estimates",
  Proposals: "proposals",
  Bills: "bills",
  Budget: "budget",
  "Purchase Orders": "purchase-orders",
  Timesheets: "timesheets",
  Overview: "overview",
  Minutes: "minutes",
  Scope: "scope",
  Checklists: "checklists",
  Defects: "defects",
  Team: "team",
};

/**
 * Preferred landing tab for a client, most useful first. The first one they
 * have permission for is where they land on their project.
 */
export const CLIENT_LANDING_TAB_ORDER = [
  "schedule",
  "selections",
  "variations",
  "client-invoices",
  "site-diary",
  "messages",
  "files",
];

type PermissionCheck = (key: string, action?: string) => boolean;

/** Can a client see this project tab? */
export function canClientSeeTab(tabId: string, hasPermission: PermissionCheck): boolean {
  const section = TAB_PERMISSIONS[tabId];
  if (!section) return false; // no key → deny by default
  return section.keys.some((key) => hasPermission(key, "view"));
}

/** Can a client see this sidebar item? */
export function canClientSeeSidebarItem(title: string, hasPermission: PermissionCheck): boolean {
  const tabId = SIDEBAR_TITLE_TO_TAB[title];
  if (!tabId) return false;
  return canClientSeeTab(tabId, hasPermission);
}

/** Where a client should land inside their project. */
export function clientLandingTab(hasPermission: PermissionCheck): string | null {
  return CLIENT_LANDING_TAB_ORDER.find((tab) => canClientSeeTab(tab, hasPermission)) ?? null;
}
