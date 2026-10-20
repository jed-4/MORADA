import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * READ ONLY. Finds estimate lines that show as dashes in the grid but still
 * carry money — "lump sum" lines, i.e. no unit cost and a non-zero amount.
 *
 * Why it matters: the grid hides the quantity and unit cost on these, so a line
 * whose price was cleared looks empty while still adding to the total. This
 * counts them and, crucially, breaks them down by the stored quantity — which
 * is what decides whether "quantity 0 means $0" is a safe rule to introduce.
 *
 * Run:  npx tsx scripts/audit-lump-sum-lines.ts
 */
async function main() {
  const summary = await db.execute(sql`
    SELECT
      count(*)::int                                            AS lump_sum_lines,
      count(*) FILTER (WHERE quantity = 0)::int                AS qty_zero,
      count(*) FILTER (WHERE quantity = 1)::int                AS qty_one,
      count(*) FILTER (WHERE quantity <> 0 AND quantity <> 1)::int AS qty_other,
      COALESCE(sum(price_inc_tax), 0)::numeric(14,2)           AS total_inc_gst,
      COALESCE(sum(price_inc_tax) FILTER (WHERE quantity = 0), 0)::numeric(14,2) AS at_risk_inc_gst
    FROM estimate_items
    WHERE COALESCE(unit_cost_ex_tax, 0) = 0
      AND COALESCE(price_inc_tax, 0) <> 0
  `);
  console.log("\n=== Lines with no unit cost but a price ===");
  console.table(((summary as any).rows ?? summary));
  console.log(
    "\nqty_zero is the set a 'quantity 0 means $0' rule would zero.\n" +
    "at_risk_inc_gst is how much money that rule would remove.\n",
  );

  const worst = await db.execute(sql`
    SELECT e.name AS estimate, i.name AS line, i.quantity, i.unit_cost_ex_tax, i.price_inc_tax, i.allowance
    FROM estimate_items i
    JOIN estimates e ON e.id = i.estimate_id
    WHERE COALESCE(i.unit_cost_ex_tax, 0) = 0
      AND COALESCE(i.price_inc_tax, 0) <> 0
      AND i.quantity = 0
    ORDER BY i.price_inc_tax DESC
    LIMIT 20
  `);
  const rows = ((worst as any).rows ?? worst) as any[];
  console.log(`=== Quantity 0 AND priced (${rows.length} shown) ===`);
  if (rows.length === 0) console.log("none\n");
  else console.table(rows);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
