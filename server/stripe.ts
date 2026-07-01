import Stripe from "stripe";

// Lazy, no-op-when-absent Stripe client. Mirrors the Sentry "no DSN = no-op"
// convention: the app must boot cleanly in dev/prod without Stripe keys. All
// billing code paths must tolerate getStripe() returning null.

let cachedClient: Stripe | null | undefined;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe | null {
  if (cachedClient !== undefined) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  cachedClient = key ? new Stripe(key) : null;
  return cachedClient;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
