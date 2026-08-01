// Shared shape of a client-facing variation document.
//
// The portal page and the PDF used to derive their own labels, grouping and
// per-line GST independently, which is how they drifted: the PDF lowercased
// the grouping key and the portal didn't (so the same line landed under
// "Materials" in one and "Material" in the other), and their status wording
// differed. Both now render from this one model.
//
// Every displayed amount is INC-GST cents, taken from the server-derived
// per-line totals rather than recomputed from qty × unit price — so the rows
// a client reads add up to the Total they're asked to approve, to the cent.

import { type Cents } from "@shared/money";

export const VARIATION_TYPE_LABELS: Record<string, string> = {
  material: "Materials",
  labour: "Labour",
  subcontractor: "Subcontractor",
  fee: "Fee / Overhead",
  equipment: "Equipment",
  allowance: "Allowances",
  other: "Other",
};

/** Grouping key for a line's type. Stored values are capitalised
 *  ("Material"), the label map is lower-cased — normalise once, here. */
export function normaliseVariationType(type: string | null | undefined): string {
  return (type || "other").toLowerCase();
}

export function variationTypeLabel(type: string | null | undefined): string {
  const key = normaliseVariationType(type);
  return VARIATION_TYPE_LABELS[key] ?? (type || "Other");
}

/** Client-facing status presentation. Deliberately worded for the person
 *  receiving the document, not for the builder's internal pipeline. */
export const VARIATION_STATUS_PRESENTATION: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  draft: { label: "Draft", bg: "#e5e7eb", text: "#374151" },
  action: { label: "Action Required", bg: "#fef3c7", text: "#92400e" },
  pending: { label: "Awaiting Approval", bg: "#dbeafe", text: "#1e40af" },
  approved: { label: "Approved", bg: "#d1fae5", text: "#065f46" },
  rejected: { label: "Rejected", bg: "#fee2e2", text: "#991b1b" },
};

export function variationStatusPresentation(status: string | null | undefined) {
  return VARIATION_STATUS_PRESENTATION[status ?? "draft"] ?? VARIATION_STATUS_PRESENTATION.draft;
}

const GST_MULTIPLIER = 0.1;

export interface VariationDocLine {
  id: string;
  name?: string | null;
  description?: string | null;
  quantity: number;
  unitType?: string | null;
  unitPriceExCents: Cents;
  amountIncCents: Cents;
}

export interface VariationDocGroup {
  type: string;
  label: string;
  lines: VariationDocLine[];
  totalIncCents: Cents;
}

export interface VariationDocBill {
  id: string;
  billNumber?: string | null;
  supplierName?: string | null;
  invoiceDate?: string | Date | null;
  totalIncCents: Cents;
}

export interface VariationDocAttachment {
  index: number;
  name: string;
  size?: number | null;
  type?: string | null;
}

export interface VariationDocModel {
  costGroups: VariationDocGroup[];
  allowanceLines: Array<{ id: string; description: string; amountIncCents: Cents }>;
  bills: VariationDocBill[];
  labourIncCents: Cents;
  /** Value of lines the builder chose not to itemise, shown as one row so the
   *  visible breakdown still reconciles with the Total. */
  notItemisedIncCents: Cents;
  subtotalCents: Cents;
  gstCents: Cents;
  totalCents: Cents;
}

/** A single line's client-facing inc-GST amount. Prefers the stored, server-
 *  derived totalPrice; falls back to qty × unitPrice for unsaved rows in the
 *  builder's live preview. */
function lineIncCents(item: any): Cents {
  const exCents =
    typeof item?.totalPrice === "number"
      ? item.totalPrice
      : Math.round((item?.quantity ?? 1) * (item?.unitPrice ?? 0));
  return item?.taxable !== false ? exCents + Math.round(exCents * GST_MULTIPLIER) : exCents;
}

export function buildVariationDocumentModel(input: {
  variation: any;
  items: any[];
  bills?: any[];
  /** Ex-GST cents; on-charged labour is a taxable supply so it is grossed up. */
  labourExCents?: number;
  /** Portal payloads arrive with hidden lines already stripped, so the value
   *  is supplied. Builder-side renders pass all items and let it be derived. */
  notItemisedIncCents?: number;
}): VariationDocModel {
  const { variation, items = [], bills = [], labourExCents = 0 } = input;

  const costItems = items.filter((i: any) => i?.itemType !== "allowance");
  const allowanceItems = items.filter((i: any) => i?.itemType === "allowance");
  const visibleCostItems = costItems.filter((i: any) => i?.showInPdf !== false);

  const groupsByType = new Map<string, VariationDocGroup>();
  for (const item of visibleCostItems) {
    const type = normaliseVariationType(item?.type);
    let group = groupsByType.get(type);
    if (!group) {
      group = { type, label: variationTypeLabel(type), lines: [], totalIncCents: 0 };
      groupsByType.set(type, group);
    }
    const amountIncCents = lineIncCents(item);
    group.lines.push({
      id: item.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity ?? 1,
      unitType: item.unitType,
      unitPriceExCents: item.unitPrice ?? 0,
      amountIncCents,
    });
    group.totalIncCents += amountIncCents;
  }

  const notItemisedIncCents =
    input.notItemisedIncCents ??
    costItems
      .filter((i: any) => i?.showInPdf === false)
      .reduce((sum: number, i: any) => sum + lineIncCents(i), 0);

  return {
    costGroups: Array.from(groupsByType.values()),
    allowanceLines: allowanceItems.map((item: any) => ({
      id: item.id,
      description: item.description,
      amountIncCents: lineIncCents(item),
    })),
    bills: bills.map((bill: any) => ({
      id: bill.id,
      billNumber: bill.billNumber,
      supplierName: bill.supplierName ?? null,
      invoiceDate: bill.invoiceDate ?? bill.billDate ?? null,
      totalIncCents: bill.totalAmountCents ?? bill.total ?? bill.totalAmount ?? 0,
    })),
    labourIncCents: labourExCents + Math.round(labourExCents * GST_MULTIPLIER),
    notItemisedIncCents,
    subtotalCents: variation?.subtotal ?? 0,
    gstCents: variation?.gstAmount ?? 0,
    totalCents: variation?.totalAmount ?? 0,
  };
}
