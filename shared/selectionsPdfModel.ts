/**
 * What the Selections Schedule PDF is allowed to say.
 *
 * The PDF is the selections document most likely to be forwarded to a client,
 * so it is built CLIENT-SAFE whoever exports it:
 *
 *   - options the builder hid from the client are left out entirely
 *   - a price (the client's price — never cost or markup) and the allowance
 *     appear only on selections set to show the client a price
 *   - internal notes are never included
 *
 * Built field by field from the rows, so a column added later stays out of the
 * document until someone adds it here on purpose. Pure: no React, no fetching.
 */
import { optionClientPriceCents } from "./selectionPricing";

export interface PdfImageRef {
  filePath: string;
  thumbnailX?: number | null;
  thumbnailY?: number | null;
  thumbnailZoom?: number | null;
}

export interface SelectionsPdfOption {
  id: string;
  name: string;
  brandLine: string;
  quantityLabel: string;
  /** Line price the client pays, cents inc GST. Null = not shown. */
  priceCents: number | null;
  chosen: boolean;
  approved: boolean;
  image: PdfImageRef | null;
}

export interface SelectionsPdfSelection {
  id: string;
  name: string;
  room: string;
  meta: string;
  /** Cents. Null when prices are not shown on this selection. */
  allowanceCents: number | null;
  chosenPriceCents: number | null;
  approvedLine: string | null;
  options: SelectionsPdfOption[];
}

export interface SelectionsPdfModel {
  rooms: Array<{ room: string; selections: SelectionsPdfSelection[] }>;
  count: number;
  /** Totals across selections that show prices and carry an allowance. */
  totals: { allowanceCents: number; selectedCents: number } | null;
}

const isImage = (a: any) =>
  String(a?.fileType ?? "").toLowerCase() === "image" || /\.(jpe?g|png|gif|webp|avif)$/i.test(a?.fileName || "");

function quantityLabel(o: any): string {
  const qty = Number(o?.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return "";
  const n = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, "");
  return o?.unitType ? `${n} ${o.unitType}` : n;
}

export function buildSelectionsPdfModel(selections: any[]): SelectionsPdfModel {
  const rooms = new Map<string, SelectionsPdfSelection[]>();
  let allowanceTotal = 0;
  let selectedTotal = 0;
  let anyBudget = false;

  for (const sel of selections ?? []) {
    // A restricted stub (a viewer without pending access) has nothing to print.
    if (!sel || sel.restricted) continue;
    const showPrice = sel.clientCanSeePrice === true;
    const visible = (sel.options ?? []).filter((o: any) => o?.visibleToClient !== false);
    const chosenRow = visible.find((o: any) => o.approvedAt) ?? visible.find((o: any) => o.isSelectedByClient);

    const options: SelectionsPdfOption[] = visible.map((o: any) => {
      const img = (o.attachments ?? []).find(isImage);
      return {
        id: String(o.id),
        name: String(o.name ?? ""),
        brandLine: [o.brand, o.sku].filter(Boolean).join(" · "),
        quantityLabel: quantityLabel(o),
        priceCents: showPrice ? optionClientPriceCents(o) : null,
        chosen: !!chosenRow && chosenRow.id === o.id,
        approved: !!o.approvedAt,
        image: img
          ? { filePath: img.filePath, thumbnailX: img.thumbnailX, thumbnailY: img.thumbnailY, thumbnailZoom: img.thumbnailZoom }
          : null,
      };
    });

    const allowanceCents = showPrice && sel.allowance != null ? Number(sel.allowance) : null;
    const chosenPriceCents = showPrice && chosenRow ? optionClientPriceCents(chosenRow) : null;
    if (allowanceCents) {
      anyBudget = true;
      allowanceTotal += allowanceCents;
      if (chosenPriceCents != null) selectedTotal += chosenPriceCents;
    }

    const approvedRow = visible.find((o: any) => o.approvedAt);
    const room = String(sel.room ?? "").trim() || "General";
    const entry: SelectionsPdfSelection = {
      id: String(sel.id),
      name: String(sel.name ?? ""),
      room,
      meta: [
        sel.category,
        sel.deadline ? `Due ${new Date(sel.deadline).toLocaleDateString("en-AU")}` : null,
      ].filter(Boolean).join(" · "),
      allowanceCents,
      chosenPriceCents,
      approvedLine: approvedRow
        ? `Approved${approvedRow.approvedBy ? ` by ${approvedRow.approvedBy}` : ""} on ${new Date(approvedRow.approvedAt).toLocaleDateString("en-AU")}`
        : null,
      options,
    };
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room)!.push(entry);
  }

  const count = Array.from(rooms.values()).reduce((n, list) => n + list.length, 0);
  return {
    rooms: Array.from(rooms.entries()).map(([room, list]) => ({ room, selections: list })),
    count,
    totals: anyBudget ? { allowanceCents: allowanceTotal, selectedCents: selectedTotal } : null,
  };
}
