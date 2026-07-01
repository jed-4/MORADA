// Central plan configuration for BuildPro billing.
//
// This is the single source of truth for plan tiers, pricing, limits and
// feature flags. Import from here anywhere plan data is needed.
//
// NOTE ON PRICE IDs: real Stripe price IDs only exist once products/prices are
// created in the Stripe dashboard (or via a seed script). Until then these read
// from env vars (STRIPE_PRICE_<PLAN>_<CYCLE>) and fall back to descriptive
// placeholders. Replace the placeholders with real `price_...` IDs — either by
// setting the env vars or editing this file — before enabling checkout.
//
// NOTE ON LIMITS/FEATURES: feature gating and user-limit enforcement are OUT OF
// SCOPE for this task (later work). The limit numbers and feature flags below
// are sensible, documented defaults for the four tiers described in the product
// spec (Subbie / Solo / Builder / Studio). Studio is intentionally identical to
// Builder in features and differs only in limits (unlimited projects/storage).

export type PlanKey = "subbie" | "solo" | "builder" | "studio";
export type BillingCycle = "monthly" | "annual";

export interface PlanLimits {
  /** Max concurrent (non-archived) projects. -1 = unlimited. */
  activeProjects: number;
  /** Included full (team) user seats. -1 = unlimited. */
  fullUsers: number;
  /** Price per extra full user, per month (AUD). */
  extraUserPriceMonthly: number;
  /** Included storage in GB. -1 = unlimited. */
  storageGB: number;
}

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  /** Monthly price in AUD (whole dollars). */
  monthlyPrice: number;
  /** Annual price in AUD (whole dollars) — equivalent to ~10 months (2 free). */
  annualPrice: number;
  monthlyPriceId: string;
  annualPriceId: string;
  mostPopular?: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
}

// Feature flags for gated/premium capabilities beyond the always-on baseline.
// These are NOT enforced yet — they exist so future gating can read one config.
export interface PlanFeatures {
  ganttSchedule: boolean;
  cfoDashboard: boolean;
  purchaseOrders: boolean;
  allowances: boolean;
  aiBillReader: boolean;
  checklists: boolean;
  scheduledMessaging: boolean;
  customRolesPermissions: boolean;
  eNotesTemplates: boolean;
  budgetTracking: boolean;
}

// Always-on features every plan includes (no flag needed):
// User Workspace, Project Overview, Notes, Tasks, Calendar, Files, Site Diary,
// Timesheets, Schedule List View, Bills, Contacts, Mobile App, Xero
// Integration, Client Invoices.
export const ALWAYS_ON_FEATURES = [
  "User Workspace",
  "Project Overview",
  "Notes",
  "Tasks",
  "Calendar",
  "Files",
  "Site Diary",
  "Timesheets",
  "Schedule List View",
  "Bills",
  "Contacts",
  "Mobile App",
  "Xero Integration",
  "Client Invoices",
] as const;

function priceId(plan: string, cycle: string, fallback: string): string {
  return process.env[`STRIPE_PRICE_${plan}_${cycle}`] || fallback;
}

const BUILDER_STUDIO_FEATURES: PlanFeatures = {
  ganttSchedule: true,
  cfoDashboard: true,
  purchaseOrders: true,
  allowances: true,
  aiBillReader: true,
  checklists: true,
  scheduledMessaging: true,
  customRolesPermissions: true,
  eNotesTemplates: true,
  budgetTracking: true,
};

export const PLANS: Record<PlanKey, PlanDefinition> = {
  subbie: {
    key: "subbie",
    name: "Subbie",
    monthlyPrice: 35,
    annualPrice: 350,
    monthlyPriceId: priceId("SUBBIE", "MONTHLY", "price_subbie_monthly"),
    annualPriceId: priceId("SUBBIE", "ANNUAL", "price_subbie_annual"),
    limits: {
      activeProjects: 1,
      fullUsers: 1,
      extraUserPriceMonthly: 15,
      storageGB: 5,
    },
    features: {
      ganttSchedule: false,
      cfoDashboard: false,
      purchaseOrders: false,
      allowances: false,
      aiBillReader: false,
      checklists: true,
      scheduledMessaging: false,
      customRolesPermissions: false,
      eNotesTemplates: false,
      budgetTracking: false,
    },
  },
  solo: {
    key: "solo",
    name: "Solo",
    monthlyPrice: 149,
    annualPrice: 1490,
    monthlyPriceId: priceId("SOLO", "MONTHLY", "price_solo_monthly"),
    annualPriceId: priceId("SOLO", "ANNUAL", "price_solo_annual"),
    limits: {
      activeProjects: 3,
      fullUsers: 2,
      extraUserPriceMonthly: 15,
      storageGB: 25,
    },
    features: {
      ganttSchedule: true,
      cfoDashboard: false,
      purchaseOrders: true,
      allowances: false,
      aiBillReader: true,
      checklists: true,
      scheduledMessaging: true,
      customRolesPermissions: false,
      eNotesTemplates: true,
      budgetTracking: true,
    },
  },
  builder: {
    key: "builder",
    name: "Builder",
    monthlyPrice: 249,
    annualPrice: 2490,
    monthlyPriceId: priceId("BUILDER", "MONTHLY", "price_builder_monthly"),
    annualPriceId: priceId("BUILDER", "ANNUAL", "price_builder_annual"),
    mostPopular: true,
    limits: {
      activeProjects: 10,
      fullUsers: 5,
      extraUserPriceMonthly: 15,
      storageGB: 100,
    },
    features: { ...BUILDER_STUDIO_FEATURES },
  },
  studio: {
    key: "studio",
    name: "Studio",
    monthlyPrice: 349,
    annualPrice: 3490,
    monthlyPriceId: priceId("STUDIO", "MONTHLY", "price_studio_monthly"),
    annualPriceId: priceId("STUDIO", "ANNUAL", "price_studio_annual"),
    limits: {
      activeProjects: -1,
      fullUsers: 15,
      extraUserPriceMonthly: 15,
      storageGB: -1,
    },
    // Studio features are identical to Builder; it differs only in limits.
    features: { ...BUILDER_STUDIO_FEATURES },
  },
};

export const PLAN_KEYS: PlanKey[] = ["subbie", "solo", "builder", "studio"];

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as string[]).includes(value);
}

export function getPlan(key: PlanKey): PlanDefinition {
  return PLANS[key];
}
