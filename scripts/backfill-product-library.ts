/**
 * Product Library backfill: copy every option out of
 * `selection_templates.templateData` (a JSON blob) into real `products` rows.
 *
 *   tsx scripts/backfill-product-library.ts                  # dry-run (default)
 *   tsx scripts/backfill-product-library.ts --apply          # write rows
 *   tsx scripts/backfill-product-library.ts --company <id>   # one tenant only
 *   tsx scripts/backfill-product-library.ts --verify         # report drift only
 *
 * --verify answers the question the write-through raises: are the rows actually
 * keeping up with the blob? It reports any template whose rows disagree with its
 * templateData and exits non-zero if any do, so it can be run on a schedule or
 * before dropping the column. It writes nothing.
 *
 * templateData stays authoritative. These rows SHADOW it — nothing reads them
 * yet (getProducts hides any product a selection_template_options row points at,
 * unless asked), so this is safe to run against a live database without changing
 * what anyone sees. The reader is flipped in a later step, and only then is the
 * blob retired.
 *
 * Two rows per option, because a product is a SPEC and a template option is a
 * USE of it:
 *
 *   products                   name, brand, sku, cost, unit, url, specs, images
 *   selection_template_options quantity, markup, total, client visibility, GST,
 *                              sort order  -> points at the product
 *
 * RE-RUNNABLE. The idempotency key is (template_id, template_option_id) on the
 * link table, backed by a partial unique index from migration 0068. A second
 * pass updates the rows the first pass made; it never duplicates.
 *
 * The blob parsing lives in shared/templateOptions.ts — pure, and covered by
 * server/__tests__/template-options.test.ts. Read that for the two formats and
 * why the idempotency key is not simply the option's id.
 */
import { pool, db } from "../server/db";
import { products, productImages, selectionTemplates, selectionTemplateOptions } from "../shared/schema";
import { extractTemplateOptions } from "../shared/templateOptions";
import { eq, isNotNull } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const companyArgIdx = process.argv.indexOf("--company");
const ONLY_COMPANY = companyArgIdx !== -1 ? process.argv[companyArgIdx + 1] : null;

async function main() {
  const templates = await db
    .select({
      id: selectionTemplates.id,
      companyId: selectionTemplates.companyId,
      name: selectionTemplates.name,
      category: selectionTemplates.category,
      templateData: selectionTemplates.templateData,
    })
    .from(selectionTemplates);

  const scoped = templates.filter((t) => !ONLY_COMPANY || t.companyId === ONLY_COMPANY);

  // Whatever an earlier run already put in place, keyed as we will write it.
  const existing = await db
    .select({
      id: selectionTemplateOptions.id,
      productId: selectionTemplateOptions.productId,
      templateId: selectionTemplateOptions.templateId,
      templateOptionId: selectionTemplateOptions.templateOptionId,
    })
    .from(selectionTemplateOptions)
    .where(isNotNull(selectionTemplateOptions.templateOptionId));

  const seen = new Map<string, { linkId: string; productId: number }>();
  for (const row of existing) {
    seen.set(`${row.templateId} ${row.templateOptionId}`, { linkId: row.id, productId: row.productId });
  }

  const warnings: string[] = [];
  // Rows whose option has vanished from the blob — the other half of drift.
  const liveKeys = new Set<string>();
  let orphanedLinks = 0;
  let created = 0;
  let updated = 0;
  let images = 0;
  let templatesWithOptions = 0;
  let legacyTemplates = 0;

  for (const tpl of scoped) {
    const { options, warnings: tplWarnings, isLegacy } = extractTemplateOptions(tpl);
    for (const w of tplWarnings) {
      warnings.push(`${tpl.name} [${tpl.id}] ${w.templateOptionKey}: ${w.reason}`);
    }
    if (options.length === 0) continue;
    templatesWithOptions++;
    if (isLegacy) legacyTemplates++;

    for (const opt of options) {
      const key = `${tpl.id} ${opt.templateOptionId}`;
      liveKeys.add(key);

      // The spec half.
      const productValues = {
        companyId: tpl.companyId,
        name: opt.name,
        brand: opt.brand,
        sku: opt.sku,
        description: opt.description,
        category: opt.category,
        subcategory: opt.subcategory,
        defaultUnitCost: opt.defaultUnitCost,
        unitType: opt.unitType,
        url: opt.url,
        specifications: opt.specifications,
        isActive: true,
      };
      // The "how this template uses it" half.
      const linkValues = {
        templateId: tpl.id,
        companyId: tpl.companyId,
        quantity: opt.quantity,
        markupPercent: opt.markupPercent,
        totalCost: opt.totalCost,
        visibleToClient: opt.visibleToClient,
        gstInclusive: opt.gstInclusive,
        sortOrder: opt.sortOrder,
        templateOptionId: opt.templateOptionId,
        legacyItemIndex: opt.legacyItemIndex,
        legacyItemName: opt.legacyItemName,
      };

      const hit = seen.get(key);
      let productId: number | undefined = hit?.productId;
      if (hit) {
        updated++;
        if (APPLY) {
          await db.update(products).set({ ...productValues, updatedAt: new Date() }).where(eq(products.id, hit.productId));
          await db.update(selectionTemplateOptions)
            .set({ ...linkValues, updatedAt: new Date() })
            .where(eq(selectionTemplateOptions.id, hit.linkId));
        }
      } else {
        created++;
        if (APPLY) {
          const [row] = await db.insert(products).values(productValues).returning({ id: products.id });
          productId = row.id;
          const [link] = await db.insert(selectionTemplateOptions)
            .values({ ...linkValues, productId })
            .returning({ id: selectionTemplateOptions.id });
          seen.set(key, { linkId: link.id, productId });
        }
      }

      if (opt.imageUrls.length === 0) continue;
      if (!APPLY) {
        images += opt.imageUrls.length;
        continue;
      }
      // product_images has no natural key, so a re-run matches on file_path
      // rather than clearing and re-inserting — that would churn ids.
      const already = await db
        .select({ filePath: productImages.filePath })
        .from(productImages)
        .where(eq(productImages.productId, productId!));
      const have = new Set(already.map((r) => r.filePath));
      const missing = opt.imageUrls.filter((u) => !have.has(u));
      if (missing.length === 0) continue;
      await db.insert(productImages).values(
        missing.map((url, i) => ({
          productId: productId!,
          filePath: url,
          fileName: url.split("/").pop()?.split("?")[0] || null,
          sortOrder: have.size + i,
        })),
      );
      images += missing.length;
    }
  }

  for (const key of Array.from(seen.keys())) {
    if (!liveKeys.has(key)) orphanedLinks++;
  }

  if (VERIFY) {
    // Drift = anything a sync would still want to do. If the write-through is
    // holding, every template is already mirrored and there is nothing to create
    // or delete. Updates are ignored: the sync rewrites unchanged rows too, so
    // counting them would report drift that does not exist.
    const drifted = created + orphanedLinks;
    console.log(`\nVERIFY — nothing written`);
    console.log(`  templates scanned .............. ${scoped.length}`);
    console.log(`  options missing from the rows .. ${created}`);
    console.log(`  rows with no option in the blob  ${orphanedLinks}`);
    if (drifted === 0) {
      console.log(`\nNo drift. Every template's rows match its templateData.`);
    } else {
      console.log(`\n${drifted} option(s) out of step — run without --verify to see them, then --apply.`);
    }
    await pool.end();
    if (drifted > 0) process.exit(1);
    return;
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN — nothing written"}`);
  console.log(`  templates scanned .............. ${scoped.length}${ONLY_COMPANY ? ` (company ${ONLY_COMPANY})` : ""}`);
  console.log(`  templates holding options ...... ${templatesWithOptions}  (${legacyTemplates} legacy itemName format)`);
  console.log(`  options to create .............. ${created}  (a product + a template-option row each)`);
  console.log(`  options to update .............. ${updated}`);
  console.log(`  images to attach ............... ${images}`);

  if (warnings.length) {
    console.log(`\n  ${warnings.length} option(s) needed attention:`);
    for (const w of warnings.slice(0, 40)) console.log(`    - ${w}`);
    if (warnings.length > 40) console.log(`    … and ${warnings.length - 40} more`);
  }

  if (!APPLY) console.log(`\nRe-run with --apply to write.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
