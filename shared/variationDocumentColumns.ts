// What the client is allowed to see on a variation document.
//
// Used by the PDF, the portal page AND the portal API payload. That last one is
// the point: hiding a column in the renderer is cosmetic, because the portal
// ships its data as JSON that anyone can read in devtools. A builder who turns
// off "Unit cost" to stop a client seeing their buy price has to actually stop
// it leaving the server, so this config is enforced there too.
//
// The set mirrors the columns in the cost-line editor, so "show the client what
// I'm looking at" is a direct mapping rather than a translation.

export interface VariationDocumentColumns {
  // ── Line columns ──
  name: boolean;
  description: boolean;
  costCode: boolean;
  quantity: boolean;
  unit: boolean;
  /** Builder's buy price per unit, ex GST. Reveals margin. */
  unitCost: boolean;
  /** Client price per unit, ex GST. */
  unitPrice: boolean;
  /** Client price per unit, inc GST. Derived — see variationDocumentModel. */
  unitPriceInc: boolean;
  /** Per-line markup percentage. Reveals margin. */
  markupPercent: boolean;
  /** Per-line markup in dollars. Reveals margin. */
  markupAmount: boolean;
  amountEx: boolean;
  amountInc: boolean;

  // ── Sections ──
  /** Type headings (Materials, Labour…) and their subtotals. */
  grouping: boolean;
  bills: boolean;
  contractSummary: boolean;
}

// Defaults are what a client should see on a document nobody has configured.
//
// Everything that reveals the builder's margin — unit cost, markup percent,
// markup amount — is OFF. That is also what makes this safe to widen: a
// variation saved under the previous, smaller config has no stored value for
// these keys, and normalise falls back to the default rather than to visible.
// Defaulting missing keys to "on" would have silently exposed cost prices on
// every existing variation the moment this shipped.
export const DEFAULT_VARIATION_DOCUMENT_COLUMNS: VariationDocumentColumns = {
  name: true,
  description: true,
  costCode: false,
  quantity: true,
  unit: true,
  unitCost: false,
  unitPrice: true,
  // On by default, unlike every other key added since this config shipped.
  // The warning above is about keys that REVEAL MARGIN — defaulting one of
  // those to visible would retroactively expose a buy price. This is the
  // client's own price with GST added, which they are being asked to pay and
  // which the Total already states, so there is nothing to leak.
  unitPriceInc: true,
  markupPercent: false,
  markupAmount: false,
  amountEx: false,
  amountInc: true,
  grouping: true,
  bills: true,
  contractSummary: true,
};

export interface VariationColumnGroup {
  title: string;
  keys: Array<keyof VariationDocumentColumns>;
}

export const VARIATION_DOCUMENT_COLUMN_LABELS: Record<
  keyof VariationDocumentColumns,
  { label: string; hint: string; revealsMargin?: boolean }
> = {
  name: { label: "Name", hint: "Short item name" },
  description: { label: "Description", hint: "Full line description" },
  costCode: { label: "Cost code", hint: "Usually internal" },
  quantity: { label: "Quantity", hint: "e.g. 12" },
  unit: { label: "Unit", hint: "e.g. m2, hr" },
  // Every money column names its GST basis, because "Unit cost" and "Unit
  // price" sitting together read as the same figure before and after tax when
  // they are actually YOUR buy price and THE CLIENT'S price — a difference of
  // margin, not of GST.
  unitCost: { label: "Unit cost (ex GST)", hint: "Your buy price — not the client's", revealsMargin: true },
  unitPrice: { label: "Unit price (ex GST)", hint: "What the client pays per unit, before GST" },
  unitPriceInc: { label: "Unit price (inc GST)", hint: "What the client pays per unit, with GST" },
  markupPercent: { label: "Markup %", hint: "Per-line markup", revealsMargin: true },
  markupAmount: { label: "Markup $ (ex GST)", hint: "Per-line markup in dollars", revealsMargin: true },
  amountEx: { label: "Amount (ex GST)", hint: "Line total before GST" },
  amountInc: { label: "Amount (inc GST)", hint: "Line total including GST" },
  // Named for what turning it OFF does, because that is what people come
  // looking for. "Trade breakdown" described what it adds and nobody found it.
  grouping: {
    label: "Group by trade",
    hint: "Materials / Labour headings with subtotals. Off gives one flat list.",
  },
  bills: { label: "Linked bills", hint: "Supplier invoices on this variation" },
  contractSummary: { label: "Contract summary", hint: "Original, current and revised figures" },
};

export const VARIATION_DOCUMENT_COLUMN_GROUPS: VariationColumnGroup[] = [
  {
    title: "Line columns",
    keys: [
      "name",
      "description",
      "costCode",
      "quantity",
      "unit",
      "unitCost",
      "unitPrice",
      "unitPriceInc",
      "markupPercent",
      "markupAmount",
      "amountEx",
      "amountInc",
    ],
  },
  { title: "Sections", keys: ["grouping", "bills", "contractSummary"] },
];

/** The line columns, in the order they render left to right. */
export const VARIATION_LINE_COLUMN_ORDER: Array<keyof VariationDocumentColumns> =
  VARIATION_DOCUMENT_COLUMN_GROUPS[0].keys;

/** Keys that would show a client the builder's cost or margin. */
export const MARGIN_REVEALING_COLUMNS = VARIATION_LINE_COLUMN_ORDER.filter(
  (k) => VARIATION_DOCUMENT_COLUMN_LABELS[k].revealsMargin,
);

/** Coerce anything out of jsonb into a complete, trustworthy config. Unknown or
 *  missing keys take the DEFAULT for that key — never a blanket "visible" —
 *  so widening the set can't retroactively expose a column on documents saved
 *  before it existed. */
export function normaliseVariationDocumentColumns(
  raw: unknown,
): VariationDocumentColumns {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_VARIATION_DOCUMENT_COLUMNS };
  for (const key of Object.keys(DEFAULT_VARIATION_DOCUMENT_COLUMNS) as Array<
    keyof VariationDocumentColumns
  >) {
    if (typeof source[key] === "boolean") out[key] = source[key] as boolean;
  }
  return out;
}

/** Per-variation choice wins; otherwise the company default; otherwise defaults. */
export function resolveVariationDocumentColumns(
  variationColumns: unknown,
  companyDefault: unknown,
): VariationDocumentColumns {
  if (variationColumns && typeof variationColumns === "object") {
    return normaliseVariationDocumentColumns(variationColumns);
  }
  return normaliseVariationDocumentColumns(companyDefault);
}

// ── Templates ───────────────────────────────────────────────────────────────

export interface VariationColumnTemplate {
  id: string;
  name: string;
  columns: VariationDocumentColumns;
}

/** Coerce the stored jsonb array. Anything malformed is dropped rather than
 *  rendered, so one bad row can't break the picker. */
export function normaliseVariationColumnTemplates(raw: unknown): VariationColumnTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .filter((t) => typeof t.id === "string" && typeof t.name === "string")
    .map((t) => ({
      id: t.id as string,
      name: t.name as string,
      columns: normaliseVariationDocumentColumns(t.columns),
    }));
}

/** True when two configs would produce the same document. Used to show which
 *  template, if any, the current selection corresponds to. */
export function variationColumnsEqual(
  a: VariationDocumentColumns,
  b: VariationDocumentColumns,
): boolean {
  return (Object.keys(DEFAULT_VARIATION_DOCUMENT_COLUMNS) as Array<
    keyof VariationDocumentColumns
  >).every((k) => a[k] === b[k]);
}
