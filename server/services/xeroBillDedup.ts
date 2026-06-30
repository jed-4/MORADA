import { db } from "../db";
import {
  bills as billsTable,
  billPayments,
  billLineItems,
  invoiceBills,
  variationBills,
  purchaseOrders,
} from "@shared/schema";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

/**
 * Xero duplicate-bill cleanup (Task #366).
 *
 * A race in the Xero bill import (check-then-insert with no DB-level uniqueness)
 * created duplicate local bills for the same Xero invoice when imports ran
 * concurrently. This module collapses every group of bills sharing the same
 * (company_id, xero_invoice_id) down to a single bill — the OLDEST by created_at
 * — after safely moving any attached data (payments, attachments, links, PO
 * matches) onto the kept original.
 *
 * It is:
 *   - idempotent (safe to run more than once — a clean DB yields a no-op),
 *   - transactional per group (reparent-then-delete cannot orphan data),
 *   - capable of a dry-run (reports exactly what it would change, writes nothing),
 *   - backed up (every deleted row + the pre-merge keeper attachment arrays are
 *     captured before deletion so the action is reversible).
 *
 * bill_line_items are deliberately NOT reparented: each duplicate already imported
 * its own full set, so a copy's line items are deleted along with the copy
 * (reparenting would double the line totals and budget actuals).
 */

export interface DedupOptions {
  /** When true, compute and report changes but write nothing. */
  dryRun: boolean;
}

interface GroupBackup {
  companyId: string | null;
  xeroInvoiceId: string;
  keeperBillId: string;
  /** Keeper's attachment_urls BEFORE the merge (so a restore can revert it). */
  keeperAttachmentUrlsBefore: unknown;
  /** Full row snapshots of every copy bill that was (or would be) deleted. */
  deletedBills: any[];
  /** Line-item snapshots for the deleted copies (deleted via cascade). */
  deletedBillLineItems: any[];
  /** invoice_bills rows explicitly deleted as collision/duplicate drops. */
  deletedInvoiceBills: any[];
  /** variation_bills rows explicitly deleted as collision/duplicate drops. */
  deletedVariationBills: any[];
}

export interface DedupGroupReport {
  companyId: string | null;
  xeroInvoiceId: string;
  keeperBillId: string;
  copyBillIds: string[];
  paymentsMoved: number;
  attachmentsMergedCount: number; // attachments added to keeper from copies
  invoiceLinksMoved: number;
  invoiceLinksDropped: number;
  variationLinksMoved: number;
  variationLinksDropped: number;
  poMatchesRepointed: number;
  projectIds: string[];
}

export interface DedupResult {
  dryRun: boolean;
  groupsFound: number;
  copiesToDelete: number;
  paymentsMoved: number;
  attachmentsMergedCount: number;
  invoiceLinksMoved: number;
  invoiceLinksDropped: number;
  variationLinksMoved: number;
  variationLinksDropped: number;
  poMatchesRepointed: number;
  affectedProjectIds: string[];
  groups: DedupGroupReport[];
  /** Backup of everything that was (or would be) deleted/mutated. */
  backup: GroupBackup[];
}

/** Normalise an attachment entry to a stable key for de-duplication. */
function attachmentKey(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const objectPath = (entry as any).objectPath;
    if (typeof objectPath === "string" && objectPath) return objectPath;
    try {
      return JSON.stringify(entry);
    } catch {
      return String(entry);
    }
  }
  return String(entry);
}

/** Merge keeper + copy attachment arrays, de-duplicated by key. Keeper order first. */
function mergeAttachments(keeper: unknown, copies: unknown[]): { merged: unknown[]; added: number } {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  const keeperArr = Array.isArray(keeper) ? keeper : [];
  for (const entry of keeperArr) {
    const k = attachmentKey(entry);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(entry);
    }
  }
  const beforeCount = merged.length;
  for (const copy of copies) {
    const copyArr = Array.isArray(copy) ? copy : [];
    for (const entry of copyArr) {
      const k = attachmentKey(entry);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(entry);
      }
    }
  }
  return { merged, added: merged.length - beforeCount };
}

/**
 * Run the duplicate-bill cleanup across the entire database.
 * Returns a report. In dry-run mode nothing is written.
 */
export async function dedupXeroBills(opts: DedupOptions): Promise<DedupResult> {
  const { dryRun } = opts;

  // 1) Find all (company_id, xero_invoice_id) groups with more than one bill.
  const groupRows = await db
    .select({
      companyId: billsTable.companyId,
      xeroInvoiceId: billsTable.xeroInvoiceId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(billsTable)
    .where(isNotNull(billsTable.xeroInvoiceId))
    .groupBy(billsTable.companyId, billsTable.xeroInvoiceId)
    .having(sql`count(*) > 1`);

  const result: DedupResult = {
    dryRun,
    groupsFound: groupRows.length,
    copiesToDelete: 0,
    paymentsMoved: 0,
    attachmentsMergedCount: 0,
    invoiceLinksMoved: 0,
    invoiceLinksDropped: 0,
    variationLinksMoved: 0,
    variationLinksDropped: 0,
    poMatchesRepointed: 0,
    affectedProjectIds: [],
    groups: [],
    backup: [],
  };

  const affectedProjects = new Set<string>();

  for (const group of groupRows) {
    const xeroInvoiceId = group.xeroInvoiceId as string;

    // Fetch every bill in this group, oldest first. The oldest is the keeper.
    const groupBills = await db
      .select()
      .from(billsTable)
      .where(
        and(
          eq(billsTable.xeroInvoiceId, xeroInvoiceId),
          group.companyId === null
            ? sql`${billsTable.companyId} is null`
            : eq(billsTable.companyId, group.companyId),
        ),
      )
      .orderBy(asc(billsTable.createdAt), asc(billsTable.id));

    if (groupBills.length <= 1) continue; // race: nothing to do anymore

    const keeper = groupBills[0];
    const copies = groupBills.slice(1);
    const copyIds = copies.map((b) => b.id);

    // Collect affected project ids (keeper + copies).
    for (const b of groupBills) {
      if (b.projectId) affectedProjects.add(b.projectId);
    }

    // ── Gather what would change (used by both dry-run and real-run) ──────────
    const paymentRows = await db
      .select({ id: billPayments.id })
      .from(billPayments)
      .where(inArray(billPayments.billId, copyIds));

    // invoice_bills: de-duplicate by invoice_id across the keeper AND all copies,
    // so at most one (invoice_id, keeper_id) link survives. A copy link is DROPPED
    // when the keeper already has that invoice_id, OR when an earlier copy already
    // claimed it; otherwise it is MOVED to the keeper.
    const keeperInvoiceLinks = await db
      .select({ invoiceId: invoiceBills.invoiceId })
      .from(invoiceBills)
      .where(eq(invoiceBills.billId, keeper.id));
    const copyInvoiceLinks = await db
      .select()
      .from(invoiceBills)
      .where(inArray(invoiceBills.billId, copyIds));
    const claimedInvoiceIds = new Set(keeperInvoiceLinks.map((r) => r.invoiceId));
    const invoiceLinksToDrop: any[] = [];
    const invoiceLinksToMoveIds: string[] = [];
    for (const link of copyInvoiceLinks) {
      if (claimedInvoiceIds.has(link.invoiceId)) {
        invoiceLinksToDrop.push(link);
      } else {
        claimedInvoiceIds.add(link.invoiceId);
        invoiceLinksToMoveIds.push(link.id);
      }
    }
    const invoiceLinksToMove = invoiceLinksToMoveIds.length;

    // variation_bills: same de-duplication across keeper + all copies.
    const keeperVariationLinks = await db
      .select({ variationId: variationBills.variationId })
      .from(variationBills)
      .where(eq(variationBills.billId, keeper.id));
    const copyVariationLinks = await db
      .select()
      .from(variationBills)
      .where(inArray(variationBills.billId, copyIds));
    const claimedVariationIds = new Set(keeperVariationLinks.map((r) => r.variationId));
    const variationLinksToDrop: any[] = [];
    const variationLinksToMoveIds: string[] = [];
    for (const link of copyVariationLinks) {
      if (claimedVariationIds.has(link.variationId)) {
        variationLinksToDrop.push(link);
      } else {
        claimedVariationIds.add(link.variationId);
        variationLinksToMoveIds.push(link.id);
      }
    }
    const variationLinksToMove = variationLinksToMoveIds.length;

    const poMatchRows = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.matchedBillId, copyIds));

    const copyAttachmentArrays = copies.map((b) => b.attachmentUrls);
    const { merged: mergedAttachments, added: attachmentsAdded } = mergeAttachments(
      keeper.attachmentUrls,
      copyAttachmentArrays,
    );

    // Snapshot line items of copies for the backup (they cascade-delete).
    const copyLineItems = await db
      .select()
      .from(billLineItems)
      .where(inArray(billLineItems.billId, copyIds));

    const groupReport: DedupGroupReport = {
      companyId: group.companyId,
      xeroInvoiceId,
      keeperBillId: keeper.id,
      copyBillIds: copyIds,
      paymentsMoved: paymentRows.length,
      attachmentsMergedCount: attachmentsAdded,
      invoiceLinksMoved: invoiceLinksToMove,
      invoiceLinksDropped: invoiceLinksToDrop.length,
      variationLinksMoved: variationLinksToMove,
      variationLinksDropped: variationLinksToDrop.length,
      poMatchesRepointed: poMatchRows.length,
      projectIds: Array.from(
        new Set(groupBills.map((b) => b.projectId).filter((p): p is string => !!p)),
      ),
    };

    const groupBackup: GroupBackup = {
      companyId: group.companyId,
      xeroInvoiceId,
      keeperBillId: keeper.id,
      keeperAttachmentUrlsBefore: keeper.attachmentUrls,
      deletedBills: copies,
      deletedBillLineItems: copyLineItems,
      deletedInvoiceBills: invoiceLinksToDrop,
      deletedVariationBills: variationLinksToDrop,
    };

    // ── Apply (real-run only), wrapped in a transaction per group ────────────
    if (!dryRun) {
      // Log the backup BEFORE mutating, so even a crash mid-transaction leaves a
      // recoverable record in the deployment logs.
      try {
        console.log(
          JSON.stringify({
            event: "xero.bill.dedup.backup",
            companyId: group.companyId,
            xeroInvoiceId,
            keeperBillId: keeper.id,
            keeperAttachmentUrlsBefore: keeper.attachmentUrls,
            deletedBills: copies,
            deletedBillLineItems: copyLineItems,
            deletedInvoiceBills: invoiceLinksToDrop,
            deletedVariationBills: variationLinksToDrop,
            ts: new Date().toISOString(),
          }),
        );
      } catch {}

      await db.transaction(async (tx) => {
        // a) Move payments to the keeper.
        if (copyIds.length > 0) {
          await tx
            .update(billPayments)
            .set({ billId: keeper.id })
            .where(inArray(billPayments.billId, copyIds));
        }

        // b) Repoint invoice_bills — drop collisions/duplicates, move the rest.
        if (invoiceLinksToDrop.length > 0) {
          await tx
            .delete(invoiceBills)
            .where(inArray(invoiceBills.id, invoiceLinksToDrop.map((r) => r.id)));
        }
        if (invoiceLinksToMoveIds.length > 0) {
          await tx
            .update(invoiceBills)
            .set({ billId: keeper.id })
            .where(inArray(invoiceBills.id, invoiceLinksToMoveIds));
        }

        // c) Repoint variation_bills — drop collisions/duplicates, move the rest.
        if (variationLinksToDrop.length > 0) {
          await tx
            .delete(variationBills)
            .where(inArray(variationBills.id, variationLinksToDrop.map((r) => r.id)));
        }
        if (variationLinksToMoveIds.length > 0) {
          await tx
            .update(variationBills)
            .set({ billId: keeper.id })
            .where(inArray(variationBills.id, variationLinksToMoveIds));
        }

        // d) Repoint PO matched_bill_id references (no FK, so manual).
        if (copyIds.length > 0) {
          await tx
            .update(purchaseOrders)
            .set({ matchedBillId: keeper.id })
            .where(inArray(purchaseOrders.matchedBillId, copyIds));
        }

        // e) Merge attachments onto the keeper.
        if (attachmentsAdded > 0) {
          await tx
            .update(billsTable)
            .set({ attachmentUrls: mergedAttachments as any })
            .where(eq(billsTable.id, keeper.id));
        }

        // f) Delete the copies (cascades line items, approvals, allowances).
        if (copyIds.length > 0) {
          await tx.delete(billsTable).where(inArray(billsTable.id, copyIds));
        }
      });
    }

    // Accumulate totals.
    result.copiesToDelete += copyIds.length;
    result.paymentsMoved += groupReport.paymentsMoved;
    result.attachmentsMergedCount += groupReport.attachmentsMergedCount;
    result.invoiceLinksMoved += groupReport.invoiceLinksMoved;
    result.invoiceLinksDropped += groupReport.invoiceLinksDropped;
    result.variationLinksMoved += groupReport.variationLinksMoved;
    result.variationLinksDropped += groupReport.variationLinksDropped;
    result.poMatchesRepointed += groupReport.poMatchesRepointed;
    result.groups.push(groupReport);
    result.backup.push(groupBackup);
  }

  result.affectedProjectIds = Array.from(affectedProjects);
  return result;
}
