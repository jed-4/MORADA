// Shared pricing types and formatting for every surface that shows plans:
// the public landing page, onboarding step 3, the paywall and billing
// settings. Prices and limits always come from the server catalogue
// (/api/billing/plans or /api/billing/public-plans) — never hardcode them
// here, or the surfaces drift apart the next time a price changes.

export type BillingCycle = "monthly" | "annual";

export interface PlanLimits {
  activeProjects: number;
  fullUsers: number;
  storageGB: number;
  extraUserPriceMonthly: number;
}

export interface PlanCatalogEntry {
  key: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  mostPopular: boolean;
  limits: PlanLimits;
}

export interface FoundingOffer {
  limit: number;
  spotsLeft: number;
  discountPercent: number;
  freeMonthDays: number;
  /** Only present on the authenticated catalogue. */
  alreadyMember?: boolean;
}

export interface PlansResponse {
  plans: PlanCatalogEntry[];
  stripeConfigured?: boolean;
  foundingOffer?: FoundingOffer | null;
}

/** The founding discount is restricted to the Studio tier (in Stripe too). */
export const FOUNDING_DISCOUNT_PLAN_KEY = "studio";

export function fmtLimit(n: number): string {
  return n === -1 ? "Unlimited" : String(n);
}

export function fmtPrice(n: number): string {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${fmtLimit(n)} ${n === 1 ? singular : pluralForm}`;
}

/** The three headline limits, phrased for a pricing card. */
export function planHighlights(limits: PlanLimits): string[] {
  return [
    plural(limits.activeProjects, "active project", "active projects"),
    plural(limits.fullUsers, "full user", "full users"),
    limits.storageGB === -1 ? "Unlimited storage" : `${limits.storageGB} GB storage`,
  ];
}

export function planPrice(plan: PlanCatalogEntry, cycle: BillingCycle): number {
  return cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
}

/**
 * The founding-member price for a plan, or null when the offer doesn't apply
 * (no offer live, or a tier other than Studio).
 */
export function foundingPrice(
  plan: PlanCatalogEntry,
  cycle: BillingCycle,
  offer: FoundingOffer | null | undefined,
): number | null {
  if (!offer || plan.key !== FOUNDING_DISCOUNT_PLAN_KEY) return null;
  return planPrice(plan, cycle) * (1 - offer.discountPercent / 100);
}
