// What the client is allowed to see on a variation document.
//
// Used by the PDF, the portal page AND the portal API payload. That last one is
// the point: hiding a column in the renderer is cosmetic, because the portal
// ships its data as JSON that anyone can read in devtools. A builder who turns
// off "Unit price" to stop a client seeing their rates has to actually stop the
// rates leaving the server, so this config is enforced there too.

export interface VariationDocumentColumns {
  /** Quantity and unit ("12 m2"). */
  quantity: boolean;
  /** Per-unit client price. The one builders most often want off. */
  unitPrice: boolean;
  /** Type headings (Materials, Labour...) and their subtotals. Off = one flat
   *  list of lines with no trade-by-trade breakdown. */
  grouping: boolean;
  /** The linked-bills section. */
  bills: boolean;
  /** The contract summary card (variation amount / current sum / revised). */
  contractSummary: boolean;
}

// Description and the line amount are deliberately NOT toggleable. A line with
// neither says nothing, and the document exists to have a number approved.
// A builder wanting a single lump sum with no breakdown already has one: clear
// "PDF" on the lines and their value collapses into "Additional works (not
// itemised)".
export const DEFAULT_VARIATION_DOCUMENT_COLUMNS: VariationDocumentColumns = {
  quantity: true,
  unitPrice: true,
  grouping: true,
  bills: true,
  contractSummary: true,
};

export const VARIATION_DOCUMENT_COLUMN_LABELS: Array<{
  key: keyof VariationDocumentColumns;
  label: string;
  hint: string;
}> = [
  { key: "quantity", label: "Quantity & unit", hint: "e.g. 12 m2" },
  { key: "unitPrice", label: "Unit price", hint: "Your per-unit rate" },
  { key: "grouping", label: "Trade breakdown", hint: "Materials / Labour headings and subtotals" },
  { key: "bills", label: "Linked bills", hint: "Supplier invoices attached to this variation" },
  { key: "contractSummary", label: "Contract summary", hint: "Original, current and revised contract figures" },
];

/** Coerce anything out of jsonb into a complete, trustworthy config. Missing or
 *  malformed keys fall back to visible — a stored value that has lost a key
 *  should degrade to showing more, never to silently dropping a column the
 *  builder never chose to hide. */
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

/** Per-variation choice wins; otherwise the company default; otherwise all on. */
export function resolveVariationDocumentColumns(
  variationColumns: unknown,
  companyDefault: unknown,
): VariationDocumentColumns {
  if (variationColumns && typeof variationColumns === "object") {
    return normaliseVariationDocumentColumns(variationColumns);
  }
  return normaliseVariationDocumentColumns(companyDefault);
}
