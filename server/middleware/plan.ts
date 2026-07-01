import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { isStripeConfigured } from "../stripe";

// Paths under /api that must never be blocked by trial enforcement — auth,
// public/token-gated portals, and the billing/stripe endpoints themselves.
// `path` here is relative to the /api mount (e.g. "/auth/user").
function isExemptPath(method: string, path: string): boolean {
  if (method === "OPTIONS") return true;
  if (path.startsWith("/auth/")) return true; // includes /auth/user
  if (path.startsWith("/billing/")) return true;
  if (path === "/stripe/webhook" || path === "/xero/webhook") return true;
  if (path.startsWith("/portal/")) return true;
  if (/^\/invitations\/by-token\/[^/]+$/.test(path)) return true;
  if (/^\/invitations\/[^/]+\/accept$/.test(path)) return true;
  if (/^\/proposals\/[^/]+\/(client-view|view|acceptances)$/.test(path)) return true;
  return false;
}

// Enforce that the caller's company has an active plan or a live trial.
// No-op when Stripe is not configured (billing not live yet) so dev and any
// pre-billing deployment keep working. Legacy companies (plan_status 'trial' or
// a null trial_ends_at) are allowed through — only a company that explicitly
// reached a lapsed/cancelled state is blocked.
export async function requireActivePlan(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isStripeConfigured()) return next();
    if (isExemptPath(req.method, req.path)) return next();

    const companyId = (req.user as any)?.companyId || (req.session as any)?.companyId;
    if (!companyId) return next(); // no company context (e.g. onboarding) — other guards handle it

    const company = await storage.getCompany(companyId);
    if (!company) return next();

    const status = company.planStatus;
    if (status === "active") return next();

    if (status === "trialing" || status === "trial") {
      if (!company.trialEndsAt || new Date(company.trialEndsAt).getTime() > Date.now()) {
        return next();
      }
    }

    return res.status(402).json({
      error: "subscription_required",
      message: "Your trial has ended. Please subscribe to continue.",
    });
  } catch (err) {
    // Fail open: never let a billing-check error take down the whole API.
    console.error("[billing] requireActivePlan error (allowing request):", err);
    return next();
  }
}
