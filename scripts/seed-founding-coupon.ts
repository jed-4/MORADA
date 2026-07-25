/**
 * Create the founding-member Stripe coupon: 50% off FOREVER, restricted to
 * the Studio product ("half price for the top tier for life").
 *
 * The free founding month is NOT part of the coupon — checkout grants it as a
 * 30-day trial (see create-checkout-session), because Stripe won't stack a
 * free-month coupon with a forever coupon on one checkout.
 *
 * Looks up the Studio product via STRIPE_PRICE_STUDIO_MONTHLY /
 * STRIPE_PRICE_STUDIO_ANNUAL (the same env vars server/config/plans.ts
 * reads), creates the coupon, and prints the coupon id — set it as
 * STRIPE_FOUNDING_STUDIO_COUPON_ID to switch the programme on.
 *
 * Usage:
 *   npx tsx scripts/seed-founding-coupon.ts            # dry run
 *   npx tsx scripts/seed-founding-coupon.ts --apply    # create the coupon
 */
import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }
  const stripe = new Stripe(key);
  const apply = process.argv.includes("--apply");
  const mode = key.startsWith("sk_live") ? "LIVE" : "test";

  const priceIds = [
    process.env.STRIPE_PRICE_STUDIO_MONTHLY,
    process.env.STRIPE_PRICE_STUDIO_ANNUAL,
  ].filter((p): p is string => !!p && p.startsWith("price_"));
  if (!priceIds.length) {
    console.error(
      "Set STRIPE_PRICE_STUDIO_MONTHLY / STRIPE_PRICE_STUDIO_ANNUAL to real price_... ids first — the coupon must be restricted to the Studio product.",
    );
    process.exit(1);
  }

  const productIds = new Set<string>();
  for (const id of priceIds) {
    const price = await stripe.prices.retrieve(id);
    const product = typeof price.product === "string" ? price.product : price.product.id;
    productIds.add(product);
  }

  console.log(`Stripe mode: ${mode}`);
  console.log(`Coupon: FOUNDING-STUDIO — 50% off forever, restricted to product(s): ${[...productIds].join(", ")}`);
  if (!apply) {
    console.log("Dry run — re-run with --apply to create the coupon.");
    return;
  }

  const coupon = await stripe.coupons.create({
    name: "FOUNDING-STUDIO",
    percent_off: 50,
    duration: "forever",
    applies_to: { products: [...productIds] },
  });
  console.log(`Created coupon ${coupon.id}`);
  console.log(`Set STRIPE_FOUNDING_STUDIO_COUPON_ID=${coupon.id} in the server environment to enable the founding programme.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
