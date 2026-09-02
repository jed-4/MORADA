/**
 * Row builders for "apply a selection template to a project".
 *
 * Lifted VERBATIM out of server/routes.ts — `applyTemplateItems` and the flat
 * branch of `POST /api/selection-templates/:id/apply`. Every quirk below is
 * preserved deliberately, including the ones that look like mistakes; this
 * module exists so the row building can be fingerprinted before step 2 swaps
 * its input from `templateData` to `products` rows, and a "tidy-up" here would
 * destroy the very baseline the fingerprint is measuring against.
 *
 * Pure: no database, no clock, no randomness. Ids come from `ctx.newId` so the
 * output is reproducible — see scripts/apply-template-fingerprint.ts.
 *
 * ── Divergences between the two branches, kept as-is ──────────────────────────
 *
 *  1. Option sortOrder fallback.
 *       legacy: opt.sortOrder ?? 0     — every option collapses to 0
 *       flat:   opt.sortOrder ?? idx   — options keep their order
 *     The legacy branch loses option ordering when sortOrder is absent.
 *
 *  2. Selection deadline type.
 *       legacy: item.deadline ? new Date(item.deadline) : null   — a Date
 *       flat:   tpl.deadline || null                             — a raw string
 *     Drizzle coerces the string on the way in, so both work today.
 *
 *  3. `|| null` versus `?? null` on money.
 *       allowance:  item.budgetAmount || null   — a budget of 0 becomes NULL
 *       unitCost:   opt.unitCost ?? null        — a cost of 0 survives
 *     A $0 allowance is meaningful in Morada (the "not included" flow), so the
 *     first of these is a latent bug. It is NOT fixed here — fixing it would
 *     move the fingerprint, which is the one thing step 2 must not do. Fix it in
 *     its own change, where the diff is the point rather than the noise.
 */

export interface ApplyContext {
  projectId: string;
  selectionType: string;
  /** Injected so fingerprints are reproducible; the route passes randomUUID. */
  newId: () => string;
}

export interface ApplyRows {
  selections: any[];
  options: any[];
  attachments: any[];
}

/** imageUrls, else a single imageUrl, else nothing. Verbatim from both branches. */
function imageUrlsOf(opt: any): string[] {
  return opt.imageUrls || (opt.imageUrl ? [opt.imageUrl] : []);
}

function buildAttachments(opt: any, optionId: string, attachments: any[]): void {
  imageUrlsOf(opt).forEach((filePath: string, idx: number) => {
    attachments.push({
      optionId,
      fileName: filePath.split("/").pop() || "image.jpg",
      filePath,
      fileType: "image",
      // Hard-coded in the original for every attachment, whatever the file
      // actually is. A .png lands labelled image/jpeg.
      mimeType: "image/jpeg",
      sortOrder: idx,
    });
  });
}

function buildOption(opt: any, selectionId: string, optionId: string, sortOrder: number): any {
  return {
    id: optionId,
    selectionId,
    name: opt.name,
    brand: opt.brand || null,
    sku: opt.sku || null,
    description: opt.description || null,
    category: opt.category || null,
    subcategory: opt.subcategory || null,
    unitCost: opt.unitCost ?? null,
    quantity: opt.quantity ?? null,
    unitType: opt.unitType || null,
    markupPercent: opt.markupPercent ?? null,
    totalCost: opt.totalCost ?? null,
    url: opt.url || null,
    visibleToClient: opt.visibleToClient ?? true,
    gstInclusive: opt.gstInclusive ?? false,
    sortOrder,
    specifications: opt.specifications || null,
  };
}

/**
 * LEGACY `itemName` format: one template holds several selections.
 * Verbatim from `applyTemplateItems`.
 */
export function buildLegacyApplyRows(items: any[], ctx: ApplyContext): ApplyRows {
  const selections = items.map((item) => ({
    id: ctx.newId(),
    projectId: ctx.projectId,
    name: item.itemName,
    description: item.description || null,
    category: item.categoryName || null,
    room: item.room || null,
    selectionType: ctx.selectionType || "selection",
    status: "draft",
    allowance: item.budgetAmount || null,
    clientCanSeePrice: item.clientCanSeePrice ?? true,
    clientCanChange: item.clientCanChange ?? true,
    deadline: item.deadline ? new Date(item.deadline) : null,
    sortOrder: item.sortOrder ?? 0,
    notes: item.notes || null,
  }));

  const options: any[] = [];
  const attachments: any[] = [];
  items.forEach((item, i) => {
    for (const opt of (item.options || [])) {
      const optionId = ctx.newId();
      options.push(buildOption(opt, selections[i].id, optionId, opt.sortOrder ?? 0));
      buildAttachments(opt, optionId, attachments);
    }
  });

  return { selections, options, attachments };
}

/**
 * NEW flat format: the template itself is one selection, and templateData is its
 * option list. Verbatim from the `else` branch of /apply.
 *
 * `maxOrder` is the highest sortOrder already on the project — the new selection
 * is appended after it. The caller supplies it because it needs a query.
 */
export function buildFlatApplyRows(
  template: any,
  options_: any[],
  maxOrder: number,
  ctx: ApplyContext,
): ApplyRows {
  const tpl = template as any;
  const selectionId = ctx.newId();
  const selections = [{
    id: selectionId,
    projectId: ctx.projectId,
    name: template.name,
    description: template.description || null,
    category: template.category || null,
    room: tpl.room || null,
    selectionType: ctx.selectionType || "selection",
    status: "draft",
    allowance: tpl.budgetAmount || null,
    clientCanSeePrice: tpl.clientCanSeePrice ?? true,
    clientCanChange: tpl.clientCanChange ?? true,
    deadline: tpl.deadline || null,
    sortOrder: maxOrder + 1,
    notes: null,
  }];

  const options: any[] = [];
  const attachments: any[] = [];
  options_.forEach((opt: any, idx: number) => {
    const optionId = ctx.newId();
    options.push(buildOption(opt, selectionId, optionId, opt.sortOrder ?? idx));
    buildAttachments(opt, optionId, attachments);
  });

  return { selections, options, attachments };
}
