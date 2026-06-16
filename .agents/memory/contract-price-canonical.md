---
name: Contract price canonical computation
description: Why contract/original-contract price must come from computeEstimateSummary().total, not cached estimate-item priceIncTax.
---

The ORIGINAL contract price (and the value stamped onto `projects.contractPrice` at
approve/contract time) must be derived from `computeEstimateSummary(items, {projectMarkupPercent, taxRate}).total`
(shared/pricing.ts), surfaced through `computeContractMetricsCents` (shared/projectMetrics.ts).

**Why:** Estimate-item `priceIncTax` already bakes in `projectMarkupPercent` for lines
that have NO explicit per-line markup (null markup inherits the project markup). If you
sum `priceIncTax` and then apply `projectMarkupPercent` again at the subtotal, those
null-markup lines get the project markup applied twice — the contract price comes out too
high. `computeEstimateSummary` avoids this: it recomputes each line from
`unitCostExTax * quantity * (1 + lineMarkup%/100)` with project markup forced to 0 at the
line level, then applies `projectMarkupPercent` exactly once at the subtotal, then GST.

**How to apply:** Any consumer of contract/original-contract price must pass the raw item
fields (`unitCostExTax`, `quantity`, `markupPercent`) plus `taxRate` into the metrics
helpers — never just the cached `priceIncTax`/`taxAmount` (those are only the fixed-price
fallback for qty*unitCost===0 PC-sum lines). When wiring a new caller, remember the 4th arg
`taxRate`: forgetting it silently defaults to 10% and breaks any non-10% estimate.
Money is CENTS server-side; estimate-item priceIncTax/taxAmount are DOLLARS (2dp);
computeEstimateSummary returns DOLLARS, so multiply by 100 and round when stamping cents.
