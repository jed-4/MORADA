/**
 * Reads options out of `selection_templates.templateData`.
 *
 * templateData is a JSON blob in one of two live formats, and the app tells them
 * apart with `'itemName' in data[0]` — see `getOptionCount` in SelectionTemplates.tsx
 * and the `/api/selection-templates/:id/apply` route. This module uses exactly
 * that test so it can never disagree with what the app applies to a job.
 *
 *   NEW (flat)  templateData: SelectionOption[]
 *               the template IS the selection; each entry is an option.
 *
 *   LEGACY      templateData: SelectionItem[], each with .itemName and .options
 *               one template holds several selections, each with its own options.
 *
 * Shared rather than script-local because the same normalisation is needed three
 * times over: by the Product Library backfill, by the reader that will replace
 * the blob, and by save-to-library.
 */

/** One option lifted out of the blob, normalised. */
export interface TemplateOption {
  /**
   * Idempotency key, unique within a template.
   *
   * The option's own `id` where one is stored — it survives reordering. Many
   * options have none: `getStableId` in SelectionTemplateItemDetail mints ids
   * with crypto.randomUUID() into a React ref and they are persisted only on an
   * explicit save, so they are neither guaranteed nor reproducible outside that
   * page session. The fallback is positional:
   *
   *   idx:0    flat format, templateData[0]
   *   idx:2/1  legacy format, templateData[2].options[1]
   */
  templateOptionId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  /** Cents, matching selection_options.unit_cost. Null when absent or unusable. */
  defaultUnitCost: number | null;
  unitType: string | null;
  url: string | null;
  /** Structured product attributes — spec-level, so it belongs on the product. */
  specifications: Record<string, any> | null;
  /** imageUrl and imageUrls merged, de-duplicated, order preserved. */
  imageUrls: string[];

  // ── How THIS template uses the product ─────────────────────────────────────
  // Not spec. These go on selection_template_options, because the same product
  // can be 2 units and client-visible in one selection and 6 and hidden in
  // another. `undefined` is preserved as null so /apply's own defaults still
  // apply on the way out — never invent a value here.
  quantity: number | null;
  markupPercent: number | null;
  totalCost: number | null;
  visibleToClient: boolean | null;
  gstInclusive: boolean | null;
  sortOrder: number | null;

  // ── Legacy grouping ────────────────────────────────────────────────────────
  // In the `itemName` format an option sits under an ITEM, and an item is a
  // selection with no table of its own. Carried so the grouping survives until
  // those items are promoted to real templates. Null for the flat format.
  legacyItemIndex: number | null;
  legacyItemName: string | null;
}

export interface TemplateOptionWarning {
  templateOptionKey: string;
  reason: string;
}

export interface ExtractResult {
  options: TemplateOption[];
  warnings: TemplateOptionWarning[];
  /** True when templateData is the legacy `itemName` shape. */
  isLegacy: boolean;
}

export interface TemplateForExtract {
  /** Falls back as the option's category when neither option nor item names one. */
  category?: string | null;
  templateData?: unknown;
}

/**
 * Absent stays absent. `?? null` rather than `|| null`, so 0 and false survive
 * — /apply distinguishes "quantity 0" from "no quantity given", and turning
 * `visibleToClient: false` into null would expose a hidden option to a client.
 */
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

function imagesOf(opt: any): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    const s = str(u);
    if (s && !out.includes(s)) out.push(s);
  };
  push(opt?.imageUrl);
  if (Array.isArray(opt?.imageUrls)) opt.imageUrls.forEach(push);
  return out;
}

/** The app's own format test, in one place. */
export function isLegacyTemplateData(data: unknown): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  return typeof first === "object" && first !== null && "itemName" in first;
}

function readOption(
  opt: any,
  positionalKey: string,
  categoryFallback: string | null,
  warnings: TemplateOptionWarning[],
  legacyItem: { index: number; name: string | null } | null = null,
): TemplateOption | null {
  const name = str(opt?.name);
  if (!name) {
    // products.name is NOT NULL, and a blank row in the library is worse than a
    // missing one. Reported rather than silently dropped.
    warnings.push({ templateOptionKey: `idx:${positionalKey}`, reason: "option has no name" });
    return null;
  }

  // unitCost is CENTS here, matching selection_options.unit_cost — the template
  // UI divides by 100 to display dollars. A non-integer means something wrote
  // dollars, which would be a 100x error if copied through.
  let defaultUnitCost: number | null = null;
  const raw = opt?.unitCost;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Number.isInteger(raw)) {
      defaultUnitCost = raw;
    } else {
      warnings.push({
        templateOptionKey: str(opt?.id) ?? `idx:${positionalKey}`,
        reason: `unitCost ${raw} is not a whole number of cents — cost left empty`,
      });
    }
  }

  return {
    templateOptionId: str(opt?.id) ?? `idx:${positionalKey}`,
    name,
    brand: str(opt?.brand),
    sku: str(opt?.sku),
    description: str(opt?.description),
    // An option rarely names its own category; the selection above it is the
    // better answer, and it is what the Category tree will group by.
    category: str(opt?.category) ?? categoryFallback,
    subcategory: str(opt?.subcategory),
    defaultUnitCost,
    unitType: str(opt?.unitType),
    url: str(opt?.url),
    specifications: opt?.specifications && typeof opt.specifications === "object" ? opt.specifications : null,
    imageUrls: imagesOf(opt),
    quantity: num(opt?.quantity),
    markupPercent: num(opt?.markupPercent),
    totalCost: num(opt?.totalCost),
    visibleToClient: bool(opt?.visibleToClient),
    gstInclusive: bool(opt?.gstInclusive),
    sortOrder: num(opt?.sortOrder),
    legacyItemIndex: legacyItem?.index ?? null,
    legacyItemName: legacyItem?.name ?? null,
  };
}

export function extractTemplateOptions(tpl: TemplateForExtract): ExtractResult {
  const data = Array.isArray(tpl.templateData) ? tpl.templateData : [];
  const warnings: TemplateOptionWarning[] = [];
  const options: TemplateOption[] = [];
  const isLegacy = isLegacyTemplateData(data);

  if (isLegacy) {
    data.forEach((item: any, i: number) => {
      const itemCategory = str(item?.categoryName) ?? str(item?.itemName) ?? str(tpl.category);
      const opts = Array.isArray(item?.options) ? item.options : [];
      opts.forEach((opt: any, j: number) => {
        const read = readOption(opt, `${i}/${j}`, itemCategory, warnings, {
          index: i,
          name: str(item?.itemName),
        });
        if (read) options.push(read);
      });
    });
  } else {
    data.forEach((opt: any, i: number) => {
      const read = readOption(opt, `${i}`, str(tpl.category), warnings);
      if (read) options.push(read);
    });
  }

  return { options, warnings, isLegacy };
}
