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

// ---------------------------------------------------------------------------
// Bill price review
// ---------------------------------------------------------------------------

import { exGstFromInc, incGstFromEx } from "./money";

/**
 * One entry in price_list_items.price_history.
 *
 * The column is plain json, written directly by storage rather than through
 * insertPriceListItemSchema, so it can carry more than that zod shape lists.
 * Bill provenance lives here: it is what turns "this price changed" into
 * "this price changed because of Bluey's invoice 4821 on 12 Aug".
 */
export type PriceHistoryEntry = {
  date: string;
  costPrice: number;
  sellPrice?: number;
  source: "manual" | "bulk" | "import" | "bill";
  /** Present when source is "bill". */
  billId?: string;
  billNumber?: string | null;
  billLineItemId?: string;
  /** Who accepted the change. Bill prices are never applied automatically. */
  acceptedBy?: string;
};

export type BillPriceComparison = {
  /** Catalogue cost, normalised to ex GST cents. */
  catalogueExCents: number;
  /** What the supplier actually charged, ex GST cents. */
  billExCents: number;
  /** billExCents - catalogueExCents. Positive means the supplier put prices up. */
  deltaCents: number;
  /** Change against the catalogue price, or null when the catalogue cost is 0. */
  deltaPercent: number | null;
  direction: "up" | "down" | "same";
  /** True when the catalogue is out of date and worth offering an update for. */
  changed: boolean;
};

/**
 * Compare what a bill charged against what the catalogue says.
 *
 * Both sides are normalised to EX GST before comparing, which is the whole
 * point of this function. Verified against real bill data 2026-08-22: every
 * bill has sum(bill_line_items.total) == bills.subtotal, and
 * sum(lines)/bills.total == 1/1.1, so bill line prices are ex GST. Catalogue
 * costPrice is ex GST too — unless the item sets gstInclusive, which is the
 * one case that needs converting. Comparing an inc price against an ex one
 * would show a phantom 10% rise on every line.
 */
export function compareBillPriceToItem(args: {
  /** price_list_items.cost_price — cents. */
  itemCostCents: number;
  /** price_list_items.gst_inclusive. */
  itemGstInclusive: boolean;
  /** bill_line_items.unit_price — cents, always ex GST. */
  billUnitPriceExCents: number;
}): BillPriceComparison {
  const catalogueExCents = args.itemGstInclusive
    ? exGstFromInc(args.itemCostCents)
    : args.itemCostCents;

  const billExCents = args.billUnitPriceExCents;
  const deltaCents = billExCents - catalogueExCents;

  return {
    catalogueExCents,
    billExCents,
    deltaCents,
    deltaPercent: catalogueExCents > 0 ? (deltaCents / catalogueExCents) * 100 : null,
    direction: deltaCents > 0 ? "up" : deltaCents < 0 ? "down" : "same",
    changed: deltaCents !== 0,
  };
}

/**
 * The cost to store when accepting a bill price, in the item's own convention —
 * the inverse of the normalisation compareBillPriceToItem does on the way in.
 */
export function billPriceAsItemCost(args: {
  itemGstInclusive: boolean;
  billUnitPriceExCents: number;
}): number {
  return args.itemGstInclusive
    ? incGstFromEx(args.billUnitPriceExCents)
    : args.billUnitPriceExCents;
}

// ---------------------------------------------------------------------------
// Matching bill lines to catalogue items
// ---------------------------------------------------------------------------

/**
 * Bill lines carry no SKU column — Jed's call, 2026-08-22: it would be noise on
 * a bill. So matching runs on the line's free-text description.
 *
 * That is less certain than a real SKU match, which is why nothing here ever
 * applies a price by itself. Every verdict is a proposal a human accepts.
 */

/** Words that appear on nearly every building invoice and carry no signal. */
const NOISE = new Set([
  "the", "and", "for", "with", "per", "each", "ea", "of", "to", "a",
  "supply", "supplied", "install", "installed", "labour", "materials",
  "item", "items", "misc", "sundry", "sundries", "charge", "fee",
]);

/** Lowercase, strip punctuation, collapse whitespace. */
export function normaliseForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string | null | undefined): string[] {
  return normaliseForMatch(value).split(" ").filter((t) => t && !NOISE.has(t));
}

export type MatchableItem = {
  id: string;
  name: string;
  nickname?: string | null;
  code?: string | null;
  supplierCode?: string | null;
  description?: string | null;
};

export type MatchCandidate = {
  item: MatchableItem;
  score: number;
  /** Why it matched, for showing the reviewer rather than a bare number. */
  reason: "code" | "exact-name" | "name-contains" | "token-overlap";
};

/**
 * Score one catalogue item against a bill line description.
 *
 * The code check is the interesting one: suppliers routinely print their
 * product code inside the line text ("PB-13-2412 Plasterboard 13mm"), so a
 * substring hit on a catalogue code buys SKU-grade precision without bills
 * needing a SKU column at all. Codes shorter than 4 characters are ignored —
 * "PB" would match half the catalogue.
 */
export function scoreItemAgainstDescription(
  description: string,
  item: MatchableItem,
): MatchCandidate | null {
  const haystack = normaliseForMatch(description);
  if (!haystack) return null;

  for (const raw of [item.code, item.supplierCode]) {
    const code = normaliseForMatch(raw);
    if (code.length >= 4 && haystack.includes(code)) {
      return { item, score: 1, reason: "code" };
    }
  }

  for (const raw of [item.name, item.nickname]) {
    const name = normaliseForMatch(raw);
    if (!name) continue;
    if (name === haystack) return { item, score: 0.95, reason: "exact-name" };
    if (name.length >= 6 && haystack.includes(name)) {
      return { item, score: 0.85, reason: "name-contains" };
    }
  }

  // Token overlap, measured against the item's own token count so a short
  // catalogue name is not punished for a long, chatty invoice line.
  const lineTokens = new Set(tokens(description));
  const itemTokens = tokens([item.name, item.nickname, item.description].filter(Boolean).join(" "));
  if (!itemTokens.length || !lineTokens.size) return null;

  const hits = itemTokens.filter((t) => lineTokens.has(t)).length;
  if (!hits) return null;

  // Deliberately low: a weak candidate is still worth surfacing, because
  // verdictFor turns low confidence into "ambiguous" rather than a silent drop.
  // Discarding it here would hide the very lines that most need a human.
  const score = (hits / itemTokens.length) * 0.8;
  return score >= 0.2 ? { item, score, reason: "token-overlap" } : null;
}

/** Best candidates for a bill line, strongest first. */
export function matchBillLine(
  description: string,
  items: MatchableItem[],
  limit = 5,
): MatchCandidate[] {
  return items
    .map((item) => scoreItemAgainstDescription(description, item))
    .filter((c): c is MatchCandidate => c !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type LineVerdict = "moved" | "unchanged" | "unmatched" | "ambiguous";

/**
 * Turn candidates plus a price comparison into the verdict a reviewer acts on.
 *
 * "ambiguous" is a deliberate outcome, not a failure: two catalogue items
 * scoring alike on a vague description is exactly the case a human (or an LLM
 * pass) should settle, and silently taking the top one is how wrong prices get
 * written.
 */
export function verdictFor(
  candidates: MatchCandidate[],
  comparison: BillPriceComparison | null,
): LineVerdict {
  if (!candidates.length) return "unmatched";
  const [best, next] = candidates;
  // A clear gap only means something above a floor: a lone 0.27 candidate is
  // not confident just because nothing else scored at all.
  const confident =
    best.score >= 0.85 ||
    (best.score >= 0.5 && (!next || best.score - next.score >= 0.15));
  if (!confident) return "ambiguous";
  if (!comparison) return "unchanged";
  return comparison.changed ? "moved" : "unchanged";
}
