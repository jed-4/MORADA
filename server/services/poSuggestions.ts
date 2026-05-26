import { db } from "../db";
import * as schema from "@shared/schema";
import { and, eq, gte, isNull, or, inArray, sql } from "drizzle-orm";
import { recomputePOStatusFromBills } from "./poStatusFromBills";
import { storage } from "../storage";

/**
 * PO number patterns BuildPro generates today. Covers any PO type:
 *   PO-2025-001    main / supplier PO
 *   SP-2025-001    site PO
 *   SO-2025-001    subcontractor / sub-order
 *   LP-2025-001    labour PO
 */
export const PO_NUMBER_RE = /\b(?:SP|SPO|PO|SO|LP)-\d{4}-\d{3,5}\b/gi;

export type SuggestSignals = {
  poNumberExact: boolean;     // PO# extracted from text/filename matches PO.poNumber exactly
  supplierMatch: boolean;     // PO supplier == bill supplier
  amountWithinTolerance: boolean; // bill total within 2% of PO total
  dateProximityDays: number | null; // days between bill date and PO date (lower = better)
};

export type SuggestCandidate = {
  poId: string;
  poNumber: string;
  score: number;
  signals: SuggestSignals;
};

export type SuggestResult = {
  candidates: SuggestCandidate[];
  topAuto: SuggestCandidate | null; // null unless safe to auto-apply
};

type BillLike = {
  id: string;
  companyId?: string | null;
  supplierId?: string | null;
  total?: number | null;          // cents (bills.total is always cents)
  billDate?: Date | string | null;
  ocrData?: any;                  // may include rawText, filenames
  attachmentUrls?: any;           // may include filenames
};

function collectSearchText(bill: BillLike, extraText?: string): string {
  const parts: string[] = [];
  if (extraText) parts.push(extraText);
  const ocr: any = bill.ocrData || {};
  if (typeof ocr.rawText === "string") parts.push(ocr.rawText);
  if (typeof ocr.invoiceNumber === "string") parts.push(ocr.invoiceNumber);
  const atts: any[] = Array.isArray(bill.attachmentUrls) ? bill.attachmentUrls : [];
  for (const a of atts) {
    if (typeof a === "string") parts.push(a);
    else if (a && typeof a === "object" && typeof a.filename === "string") parts.push(a.filename);
  }
  return parts.join(" \n ");
}

export function extractPONumbers(text: string): string[] {
  if (!text) return [];
  const matches = text.match(PO_NUMBER_RE) || [];
  return Array.from(new Set(matches.map(m => m.toUpperCase())));
}

/**
 * Rank candidate POs for a bill using:
 *   +100  PO number exact match (text/filename)
 *   +60   supplier match (required for a result to be returned)
 *   +40   amount within 2% of PO total
 *   +20   amount within 10% of PO total
 *   +10   bill date within 60 days of PO date
 *
 * Filters POs: same companyId, status sent/invoiced/partially_paid, not cancelled/paid/draft.
 * Returns top 3 candidates plus `topAuto` when (PO# exact && supplier match) — caller may
 * link without confirmation.
 */
export async function suggestPOsForBill(
  bill: BillLike,
  opts: { extraText?: string } = {},
): Promise<SuggestResult> {
  const companyId = bill.companyId;
  if (!companyId) return { candidates: [], topAuto: null };

  const searchText = collectSearchText(bill, opts.extraText);
  const detectedNumbers = extractPONumbers(searchText);

  // Pull a candidate pool: same company, open-ish status, created in the last
  // ~120 days OR same supplier as the bill, plus any PO whose number was
  // detected on the bill (so a stale/closed PO can still surface).
  //
  // The 120-day / same-supplier filter keeps the candidate set bounded so
  // ranking doesn't drown in old POs (architect callout from #298 review).
  const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const openConditions = and(
    eq(schema.purchaseOrders.companyId, companyId),
    or(
      eq(schema.purchaseOrders.status, "sent" as any),
      eq(schema.purchaseOrders.status, "invoiced" as any),
      eq(schema.purchaseOrders.status, "partially_paid" as any),
    ),
    or(
      gte(schema.purchaseOrders.createdAt, cutoff),
      bill.supplierId
        ? eq(schema.purchaseOrders.supplierId, bill.supplierId)
        : sql`false`,
    ),
  );

  const openPOs = await db.select().from(schema.purchaseOrders).where(openConditions);
  let detectedPOs: typeof openPOs = [];
  if (detectedNumbers.length > 0) {
    detectedPOs = await db
      .select()
      .from(schema.purchaseOrders)
      .where(and(
        eq(schema.purchaseOrders.companyId, companyId),
        inArray(schema.purchaseOrders.poNumber, detectedNumbers),
      ));
  }

  const byId = new Map<string, any>();
  for (const po of [...openPOs, ...detectedPOs]) byId.set(po.id, po);

  const billTotal = typeof bill.total === "number" ? bill.total : 0;
  const billDate = bill.billDate ? new Date(bill.billDate as any) : null;

  const candidates: SuggestCandidate[] = [];
  for (const po of byId.values()) {
    if (po.status === "cancelled") continue;

    const supplierMatch = !!(bill.supplierId && po.supplierId && bill.supplierId === po.supplierId);
    const poNumberExact = detectedNumbers.includes(String(po.poNumber).toUpperCase());

    let amountWithin2 = false;
    let amountWithin10 = false;
    if (billTotal > 0 && typeof po.total === "number" && po.total > 0) {
      const ratio = billTotal / po.total;
      amountWithin2 = ratio >= 0.98 && ratio <= 1.02;
      amountWithin10 = ratio >= 0.9 && ratio <= 1.1;
    }

    let dateProximityDays: number | null = null;
    if (billDate && po.poDate) {
      const poDate = new Date(po.poDate as any);
      dateProximityDays = Math.abs(billDate.getTime() - poDate.getTime()) / (1000 * 60 * 60 * 24);
    }
    const dateWithin60 = dateProximityDays !== null && dateProximityDays <= 60;

    // Supplier match is a hard requirement UNLESS the PO number matches exactly
    // (an exact PO# is an authoritative signal even if the bill's supplier
    // hasn't been resolved yet).
    if (!supplierMatch && !poNumberExact) continue;

    let score = 0;
    if (poNumberExact) score += 100;
    if (supplierMatch) score += 60;
    if (amountWithin2) score += 40;
    else if (amountWithin10) score += 20;
    if (dateWithin60) score += 10;

    candidates.push({
      poId: po.id,
      poNumber: po.poNumber,
      score,
      signals: {
        poNumberExact,
        supplierMatch,
        amountWithinTolerance: amountWithin2,
        dateProximityDays,
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);

  // Auto-apply when an explicit PO number was extracted from the bill and
  // matches an existing PO exactly. Supplier-match is a "nice to have" here:
  // an exact PO# pulled from the document is an authoritative signal, and
  // historical behaviour (pre-#298) auto-linked on PO# alone — keep that.
  const topAuto = top[0] && top[0].signals.poNumberExact ? top[0] : null;

  return { candidates: top, topAuto };
}

/**
 * Apply suggestions to a bill: persist the ranked PO IDs as `suggestedSitePOIds`
 * (legacy column name, now PO-type-agnostic) and, if a top candidate is safe to
 * auto-link, set `matchedSitePOId` and recompute the linked PO's status.
 *
 * Returns the actions taken so callers can log/report.
 */
export async function applyPOSuggestionsToBill(
  bill: BillLike & { matchedSitePOId?: string | null },
  opts: { extraText?: string; autoApply?: boolean } = {},
): Promise<{ matchedPOId: string | null; suggestedPOIds: string[] }> {
  // Don't re-suggest if the bill is already linked
  if (bill.matchedSitePOId) {
    return { matchedPOId: bill.matchedSitePOId, suggestedPOIds: [] };
  }

  const { candidates, topAuto } = await suggestPOsForBill(bill, { extraText: opts.extraText });
  const suggestedPOIds = candidates.map(c => c.poId);
  const autoApply = opts.autoApply !== false;

  if (autoApply && topAuto) {
    await storage.updateBill(bill.id, {
      matchedSitePOId: topAuto.poId,
      suggestedSitePOIds: [],
    } as any);
    try {
      await recomputePOStatusFromBills(topAuto.poId);
    } catch (e) {
      console.error("[applyPOSuggestionsToBill] recompute failed:", e);
    }
    return { matchedPOId: topAuto.poId, suggestedPOIds: [] };
  }

  if (suggestedPOIds.length > 0) {
    await storage.updateBill(bill.id, { suggestedSitePOIds: suggestedPOIds } as any);
  }
  return { matchedPOId: null, suggestedPOIds };
}
