/**
 * One-shot backfill: recompute estimate_items.tax_amount + price_inc_tax for
 * legacy rows whose cached values disagree with the current shared pricing
 * formula (shared/pricing.ts).
 *
 * Skips fixed-price lines (unit_cost_ex_tax === 0, per isFixedPriceLine) — those
 * are PC sums / provisional allowances and the cached value IS the authoritative
 * price. A priced line (unitCost > 0) with quantity 0 is NOT fixed-price and
 * recomputes to $0 — the old `qty * unit === 0` test wrongly preserved those.
 *
 * Usage:
 *   tsx scripts/backfill-estimate-prices.ts            # dry-run (default)
 *   tsx scripts/backfill-estimate-prices.ts --apply    # actually update rows
 */
import { pool, db } from "../server/db";
import { estimateItems, estimates } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import { computeEstimateItemPrice, isFixedPriceLine, round2 } from "../shared/pricing";

const APPLY = process.argv.includes("--apply");

interface DriftRow {
  id: string;
  estimateId: string;
  name: string;
  quantity: number;
  unitCostExTax: number;
  markupPercent: number | null;
  storedTaxAmount: number;
  storedPriceIncTax: number;
  newTaxAmount: number;
  newPriceIncTax: number;
  projectMarkupPercent: number | null;
  taxRate: number | null;
}

async function main() {
  console.log(
    `[backfill] mode=${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`,
  );

  const rows = await db
    .select({
      id: estimateItems.id,
      estimateId: estimateItems.estimateId,
      name: estimateItems.name,
      quantity: estimateItems.quantity,
      unitCostExTax: estimateItems.unitCostExTax,
      markupPercent: estimateItems.markupPercent,
      storedTaxAmount: estimateItems.taxAmount,
      storedPriceIncTax: estimateItems.priceIncTax,
      projectMarkupPercent: estimates.projectMarkupPercent,
      taxRate: estimates.taxRate,
    })
    .from(estimateItems)
    .innerJoin(estimates, eq(estimateItems.estimateId, estimates.id));

  console.log(`[backfill] scanned ${rows.length} estimate_items rows`);

  let fixedPriceCount = 0;
  let alreadyCorrect = 0;
  const drift: DriftRow[] = [];

  for (const r of rows) {
    const qty = Number(r.quantity ?? 0);
    const unit = Number(r.unitCostExTax ?? 0);

    // Fixed-price line (flat PC/PS amount, no per-unit cost) — the cached
    // price is authoritative. Classified on unitCost ALONE so a zeroed
    // priced line still recomputes to $0 below.
    if (isFixedPriceLine(unit)) {
      fixedPriceCount++;
      continue;
    }

    const computed = computeEstimateItemPrice({
      unitCostExTax: unit,
      quantity: qty,
      markupPercent: r.markupPercent,
      projectMarkupPercent: r.projectMarkupPercent,
      taxRate: r.taxRate,
    });

    const storedTax = round2(Number(r.storedTaxAmount ?? 0));
    const storedInc = round2(Number(r.storedPriceIncTax ?? 0));

    if (
      storedTax === computed.taxAmount &&
      storedInc === computed.lineIncTax
    ) {
      alreadyCorrect++;
      continue;
    }

    drift.push({
      id: r.id,
      estimateId: r.estimateId,
      name: r.name,
      quantity: qty,
      unitCostExTax: unit,
      markupPercent: r.markupPercent,
      storedTaxAmount: storedTax,
      storedPriceIncTax: storedInc,
      newTaxAmount: computed.taxAmount,
      newPriceIncTax: computed.lineIncTax,
      projectMarkupPercent: r.projectMarkupPercent,
      taxRate: r.taxRate,
    });
  }

  console.log(`[backfill] fixed-price (skipped):     ${fixedPriceCount}`);
  console.log(`[backfill] already correct:           ${alreadyCorrect}`);
  console.log(`[backfill] drift (needs update):      ${drift.length}`);

  if (drift.length > 0) {
    const sample = drift.slice(0, 10);
    console.log(`\n[backfill] sample of up to 10 drifted rows:`);
    for (const d of sample) {
      const incDelta = round2(d.newPriceIncTax - d.storedPriceIncTax);
      console.log(
        `  ${d.id}  est=${d.estimateId}  "${d.name.slice(0, 40)}"  ` +
          `qty=${d.quantity} unit=${d.unitCostExTax} ` +
          `markup%(item=${d.markupPercent ?? "null"}, proj=${d.projectMarkupPercent ?? "null"}) ` +
          `tax%=${d.taxRate ?? 10}  ` +
          `inc: ${d.storedPriceIncTax} → ${d.newPriceIncTax}  (Δ ${incDelta >= 0 ? "+" : ""}${incDelta})`,
      );
    }

    const totalDelta = drift.reduce(
      (acc, d) => acc + (d.newPriceIncTax - d.storedPriceIncTax),
      0,
    );
    console.log(
      `\n[backfill] net change to summed priceIncTax across drifted rows: ${round2(totalDelta) >= 0 ? "+" : ""}${round2(totalDelta)}`,
    );
  }

  if (!APPLY) {
    console.log(
      `\n[backfill] DRY-RUN complete. Re-run with --apply to write changes.`,
    );
    await pool.end();
    return;
  }

  if (drift.length === 0) {
    console.log(`\n[backfill] nothing to update — exiting.`);
    await pool.end();
    return;
  }

  console.log(`\n[backfill] APPLY: updating ${drift.length} rows...`);
  let updated = 0;
  for (const d of drift) {
    await db
      .update(estimateItems)
      .set({
        taxAmount: d.newTaxAmount,
        priceIncTax: d.newPriceIncTax,
      })
      .where(eq(estimateItems.id, d.id));
    updated++;
    if (updated % 50 === 0) {
      console.log(`[backfill]   ${updated} / ${drift.length} updated`);
    }
  }
  console.log(`[backfill] done — updated ${updated} rows.`);

  // Light sanity check: re-count drifted rows after apply.
  const after = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM estimate_items ei
    JOIN estimates e ON e.id = ei.estimate_id
    WHERE ei.unit_cost_ex_tax > 0
  `);
  console.log(
    `[backfill] post-apply: ${(after as any).rows?.[0]?.n ?? "?"} non-fixed-price rows total in db`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] FAILED:", err);
  pool.end().finally(() => process.exit(1));
});
