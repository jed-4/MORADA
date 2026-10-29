import type { VariationDocumentColumns } from "@shared/variationDocumentColumns";
import { buildVariationDocumentModel } from "../client/src/components/variations/variationDocumentModel";

/**
 * A variation's document, already worked out, for the phone app.
 *
 * The web portal and the PDF both render from buildVariationDocumentModel —
 * one model, so the rows a client reads add up to the Total they're asked to
 * approve, to the cent. The phone app can't import that module (it lives in
 * the web client), and a second copy of the money logic would be exactly the
 * drift the model exists to stop. So the server runs the SAME function over
 * the SAME client-safe payload and ships the result.
 *
 * Built from the portal payload's items — already stripped of hidden lines
 * and of every field the column config hides — and then each line is cut
 * down to the columns the document shows. A line field a column hides never
 * leaves the server, even zeroed: with unit cost hidden, the model's
 * markup-amount would otherwise read as the whole line amount.
 */

export interface ClientDocLine {
  id: string;
  name?: string | null;
  description?: string | null;
  costCode?: string | null;
  quantity?: number;
  unitType?: string | null;
  unitCostExCents?: number;
  unitPriceExCents?: number;
  unitPriceIncCents?: number;
  markupPercent?: number | null;
  markupAmountExCents?: number;
  amountExCents?: number;
  amountIncCents?: number;
}

export interface ClientVariationDocument {
  grouped: boolean;
  groups: Array<{ type: string; label: string; totalIncCents: number; lines: ClientDocLine[] }>;
  lines: ClientDocLine[];
  allowanceLines: Array<{ id: string; description: string; amountIncCents: number }>;
  bills: Array<{ id: string; billNumber?: string | null; supplierName?: string | null; totalIncCents: number }>;
  labourIncCents: number;
  notItemisedIncCents: number;
  globalMarkupIncCents: number;
  globalMarkupPercent: number;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
}

/** Column key → the line fields it reveals. */
const LINE_FIELDS: Array<[keyof VariationDocumentColumns, Array<keyof ClientDocLine>]> = [
  ["name", ["name"]],
  ["description", ["description"]],
  ["costCode", ["costCode"]],
  ["quantity", ["quantity"]],
  ["unit", ["unitType"]],
  ["unitCost", ["unitCostExCents"]],
  ["unitPrice", ["unitPriceExCents"]],
  ["unitPriceInc", ["unitPriceIncCents"]],
  ["markupPercent", ["markupPercent"]],
  ["markupAmount", ["markupAmountExCents"]],
  ["amountEx", ["amountExCents"]],
  ["amountInc", ["amountIncCents"]],
];

function pickLine(line: Record<string, any>, columns: VariationDocumentColumns): ClientDocLine {
  const out: ClientDocLine = { id: line.id };
  for (const [column, fields] of LINE_FIELDS) {
    if (!columns[column]) continue;
    for (const field of fields) (out as any)[field] = line[field];
  }
  return out;
}

export function buildClientVariationDocument(payload: {
  variation: any;
  items: any[];
  bills?: any[];
  labourTotalCents?: number;
  notItemisedIncCents?: number;
  columns: VariationDocumentColumns;
}): ClientVariationDocument {
  const model = buildVariationDocumentModel({
    variation: payload.variation,
    items: payload.items ?? [],
    bills: payload.bills ?? [],
    labourExCents: payload.labourTotalCents ?? 0,
    notItemisedIncCents: payload.notItemisedIncCents ?? 0,
  });
  const cols = payload.columns;
  return {
    grouped: !!cols.grouping,
    groups: model.costGroups.map((g) => ({
      type: g.type,
      label: g.label,
      totalIncCents: g.totalIncCents,
      lines: g.lines.map((l) => pickLine(l, cols)),
    })),
    lines: model.costLines.map((l) => pickLine(l, cols)),
    allowanceLines: model.allowanceLines,
    bills: model.bills.map((b) => ({ id: b.id, billNumber: b.billNumber, supplierName: b.supplierName, totalIncCents: b.totalIncCents })),
    labourIncCents: model.labourIncCents,
    notItemisedIncCents: model.notItemisedIncCents,
    globalMarkupIncCents: model.globalMarkupIncCents,
    globalMarkupPercent: model.globalMarkupPercent,
    subtotalCents: model.subtotalCents,
    gstCents: model.gstCents,
    totalCents: model.totalCents,
  };
}
