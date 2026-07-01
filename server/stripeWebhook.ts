import type Stripe from "stripe";
import { storage } from "./storage";

function customerId(customer: string | { id: string } | null | undefined): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

async function setPlanStatusByCustomer(
  customer: string | { id: string } | null | undefined,
  fields: { planStatus: string; stripeSubscriptionId?: string },
): Promise<void> {
  const custId = customerId(customer);
  if (!custId) return;
  const company = await storage.getCompanyByStripeCustomerId(custId);
  if (!company) {
    console.warn(`[stripe webhook] no company matched stripe_customer_id=${custId}`);
    return;
  }
  await storage.updateCompany(company.id, fields as any);
}

// Map Stripe's subscription.status to our internal plan_status so we always
// mirror Stripe's source of truth instead of assuming "active" on every update.
function mapSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete_expired":
      return "expired";
    case "incomplete":
      // Awaiting the initial payment — keep access until it resolves either way.
      return "trialing";
    default:
      return "active";
  }
}

// Mirror Stripe subscription lifecycle into companies.plan_status /
// stripe_subscription_id. Matching is by stripe_customer_id.
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created": {
      // Trial-to-paid transition: also promote the effective plan to the tier
      // the company chose at checkout (recorded on the company row).
      const sub = event.data.object as Stripe.Subscription;
      const custId = customerId(sub.customer);
      const company = custId ? await storage.getCompanyByStripeCustomerId(custId) : null;
      if (company) {
        const fields: Record<string, unknown> = {
          planStatus: mapSubscriptionStatus(sub.status),
          stripeSubscriptionId: sub.id,
        };
        if ((company as any).chosenPlan) fields.plan = (company as any).chosenPlan;
        await storage.updateCompany(company.id, fields as any);
      } else if (custId) {
        console.warn(`[stripe webhook] no company matched stripe_customer_id=${custId}`);
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await setPlanStatusByCustomer(sub.customer, {
        planStatus: mapSubscriptionStatus(sub.status),
        stripeSubscriptionId: sub.id,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setPlanStatusByCustomer(sub.customer, { planStatus: "cancelled" });
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      await setPlanStatusByCustomer(invoice.customer, { planStatus: "active" });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // A failed payment moves the sub to past_due, not immediately expired.
      // Stripe emits customer.subscription.deleted / updated when it finally
      // lapses, which is when we mark it expired/cancelled.
      await setPlanStatusByCustomer(invoice.customer, { planStatus: "past_due" });
      break;
    }
    default:
      // Ignore unrelated events.
      break;
  }
}
