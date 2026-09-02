/**
 * Applies the templateData -> selection_template_options write-through.
 *
 * Thin on purpose: the diff is pure and tested in shared/templateOptionSync.ts,
 * and this only turns that plan into statements. Called by every route that
 * writes `selection_templates.templateData`, so the rows /apply reads can never
 * be older than the blob.
 *
 * NEVER throws into the caller. A template save must not fail because its
 * library mirror could not be written — the blob is still authoritative and
 * /apply still falls back to it, so a failed sync degrades to the old behaviour
 * rather than losing the user's edit. Failures are logged and reported through
 * the return value.
 */
import { db } from "../db";
import * as schema from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { extractTemplateOptions } from "@shared/templateOptions";
import { planTemplateOptionSync } from "@shared/templateOptionSync";

export interface SyncResult {
  ok: boolean;
  created: number;
  updated: number;
  deleted: number;
  warnings: string[];
  error?: string;
}

export async function syncTemplateOptions(
  templateId: string,
  companyId: string,
  templateData: unknown,
  templateCategory: string | null = null,
): Promise<SyncResult> {
  const result: SyncResult = { ok: true, created: 0, updated: 0, deleted: 0, warnings: [] };
  try {
    const { options, warnings } = extractTemplateOptions({ category: templateCategory, templateData });
    result.warnings = warnings.map((w) => `${w.templateOptionKey}: ${w.reason}`);

    const existing = await db
      .select({
        id: schema.selectionTemplateOptions.id,
        productId: schema.selectionTemplateOptions.productId,
        templateOptionId: schema.selectionTemplateOptions.templateOptionId,
      })
      .from(schema.selectionTemplateOptions)
      .where(and(
        eq(schema.selectionTemplateOptions.templateId, templateId),
        eq(schema.selectionTemplateOptions.companyId, companyId),
      ));

    const plan = planTemplateOptionSync(existing, options);

    const productValues = (o: (typeof options)[number]) => ({
      companyId,
      name: o.name,
      brand: o.brand,
      sku: o.sku,
      description: o.description,
      category: o.category,
      subcategory: o.subcategory,
      defaultUnitCost: o.defaultUnitCost,
      unitType: o.unitType,
      url: o.url,
      specifications: o.specifications,
      isActive: true,
    });
    const linkValues = (o: (typeof options)[number]) => ({
      templateId,
      companyId,
      quantity: o.quantity,
      markupPercent: o.markupPercent,
      totalCost: o.totalCost,
      visibleToClient: o.visibleToClient,
      gstInclusive: o.gstInclusive,
      sortOrder: o.sortOrder,
      optionCategory: o.ownCategory,
      templateOptionId: o.templateOptionId,
      legacyItemIndex: o.legacyItemIndex,
      legacyItemName: o.legacyItemName,
    });

    // Update in place rather than delete-and-recreate: recreating would orphan
    // the product row and lose the images hanging off it.
    for (const { link, option } of plan.updates) {
      await db.update(schema.products)
        .set({ ...productValues(option), updatedAt: new Date() })
        .where(eq(schema.products.id, link.productId));
      await db.update(schema.selectionTemplateOptions)
        .set({ ...linkValues(option), updatedAt: new Date() })
        .where(eq(schema.selectionTemplateOptions.id, link.id));
      result.updated++;
    }

    for (const option of plan.creates) {
      const [product] = await db.insert(schema.products)
        .values(productValues(option))
        .returning({ id: schema.products.id });
      await db.insert(schema.selectionTemplateOptions)
        .values({ ...linkValues(option), productId: product.id });
      result.created++;
    }

    if (plan.deletes.length > 0) {
      const ids = plan.deletes.map((d) => d.id);
      await db.delete(schema.selectionTemplateOptions)
        .where(inArray(schema.selectionTemplateOptions.id, ids));
      // The product rows are deliberately left behind. A product is library
      // content — removing an option from a template is not a statement that the
      // product should cease to exist, and another template may already point at
      // it. Tidying genuinely unreferenced products is a separate decision.
      result.deleted = ids.length;
    }

    return result;
  } catch (err: any) {
    console.error(`[templateOptionSync] template ${templateId}:`, err);
    return { ...result, ok: false, error: err?.message ?? String(err) };
  }
}
