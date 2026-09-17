/**
 * Which project sections a client-portal user can see.
 *
 * The sidebar keys sections by title ("Site Diary") and the project page keys
 * them by tab id ("site-diary"); this is the one place both vocabularies map to
 * a permission key, so ticking a permission in Roles & Permissions drives the
 * nav and the tabs together.
 *
 * Sections absent from this table have no client portal key and are therefore
 * never shown to a client — deny by default.
 *
 * This is presentation only. The server's clientAccessGate is what actually
 * enforces access; hiding a tab here never stands in for that.
 */

import { PORTAL_KEYS } from "@shared/clientPortalPermissions";

export interface SectionPermission {
  /** Permission key(s) — a client needs `view` on any one of them. */
  keys: string[];
}

/**
 * Project tab id (PROJECT_TAB_GROUPS in CustomizableProjectOverview) → client
 * portal permission. Only portal.* keys: a client role never holds the team's
 * projects.* keys (shared/clientPortalPermissions.ts), so builder-only tabs
 * (notes, tasks, RFIs, files, estimates, bills, budget…) simply have no entry.
 */
export const TAB_PERMISSIONS: Record<string, SectionPermission> = {
  schedule: { keys: [PORTAL_KEYS.schedule] },
  selections: { keys: [PORTAL_KEYS.selections] },
  reviews: { keys: [PORTAL_KEYS.reviews] },
  allowances: { keys: [PORTAL_KEYS.allowances] },
  variations: { keys: [PORTAL_KEYS.variations] },
  "client-invoices": { keys: [PORTAL_KEYS.invoices] },
  "site-diary": { keys: [PORTAL_KEYS.siteDiary] },
  messages: { keys: [PORTAL_KEYS.messages] },
};

/** Sidebar item title (projectFlatOrder in SidebarNav) → project tab id. */
export const SIDEBAR_TITLE_TO_TAB: Record<string, string> = {
  Schedule: "schedule",
  Selections: "selections",
  Reviews: "reviews",
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
  // First: the section that is waiting on the client, not just informing them.
  "reviews",
  "schedule",
  "selections",
  "variations",
  "client-invoices",
  "allowances",
  "site-diary",
  "messages",
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
