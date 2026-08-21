// Price list pricing rules.
//
// Deliberately its own file rather than an addition to shared/schema.ts — editing
// that file perturbs type inference across the app and surfaces ~30 latent errors
// in unrelated pages (Gantt, Schedule). Nothing here needs to live there.

import type { PriceListItem } from "./schema";

/** Just the fields the rules below read, so callers can pass partial rows. */
export type PricedItem = Pick<PriceListItem, "costPrice" | "sellPrice" | "markupPercent">;

/**
 * MARKUP WINS (Jed, 2026-08-22). When an item carries a markup percentage, its
 * sell price is derived from cost every time it is read — so a supplier's price
 * rise flows straight through to what you charge, instead of leaving a sell price
 * that quietly went stale. A stored sellPrice is only used when there is no
 * markup; it is left in the column rather than nulled, so turning a markup off
 * restores whatever was there before.
 *
 * Returns cents, or null when the item has neither a markup nor a stored sell.
 */
export function resolveSellCents(item: PricedItem): number | null {
  const markup = parseMarkup(item.markupPercent);
  if (markup !== null) {
    const cost = item.costPrice ?? 0;
    return Math.round(cost * (1 + markup / 100));
  }
  return item.sellPrice ?? null;
}

/** True when sell is being computed rather than stored — drives read-only UI. */
export function isSellDerived(item: PricedItem): boolean {
  return parseMarkup(item.markupPercent) !== null;
}

/**
 * The markup to display: the stored percentage when there is one, otherwise the
 * effective markup implied by cost and sell. Returns null when it can't be known
 * (no cost to mark up from, or nothing to compare against).
 */
export function effectiveMarkup(item: PricedItem): number | null {
  const stored = parseMarkup(item.markupPercent);
  if (stored !== null) return stored;

  const cost = item.costPrice ?? 0;
  const sell = item.sellPrice ?? 0;
  if (cost <= 0 || sell <= 0) return null;
  return ((sell - cost) / cost) * 100;
}

/** markup_percent is numeric(10,2), so Drizzle hands it back as a string. */
function parseMarkup(value: PricedItem["markupPercent"]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}
