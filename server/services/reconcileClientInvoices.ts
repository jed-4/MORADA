/**
 * Nightly catch-up for client invoices against Xero.
 *
 * Bills have had a sweep for a while; client invoices only ever had the
 * webhook. A webhook is a single delivery attempt against an endpoint that is
 * not always up — every deploy restarts the app, and a delivery that lands in
 * that window is simply lost. One missed event left an invoice stale until
 * somebody noticed and pressed Sync, which is what "they don't reconcile by
 * themselves" actually looked like.
 *
 * This is the safety net, not the mechanism: the webhook stays the fast path
 * and this catches whatever it dropped.
 *
 * It applies state through the SAME writer the webhook and the Sync button
 * use (applyXeroClientInvoiceState), so a third way for these three to drift
 * is not created here — that drift was the bug in the first place.
 */
import { applyXeroClientInvoiceState } from "./xeroClientInvoiceState";

// db / storage / xeroService are pulled in lazily inside liveDeps below.
// Imported at the top they would open a database connection merely to LOAD
// this file, which would mean the sweep could not be unit-tested without one —
// and it is exactly the part that must be testable without a Xero connection.

export interface ClientInvoiceReconcileReport {
  connected: boolean;
  checked: number;
  changed: number;
  /** Linked locally but not returned by Xero — deleted there, or outside the window. */
  missingInXero: number;
}

/** Statuses worth pulling: anything that can still move. */
const STATUSES = ["AUTHORISED", "PAID", "SUBMITTED", "VOIDED", "DRAFT"];

/**
 * The outside world, injected so the matching and counting can be tested
 * without a Xero connection — the standing rule is no test writes to the
 * production Xero organisation, so the alternative is not testing it.
 */
export interface ReconcileDeps {
  getConnection(companyId: string): Promise<{ id: string; isActive: boolean | null } | null | undefined>;
  listLinkedInvoices(companyId: string): Promise<any[]>;
  listXeroInvoices(connectionId: string, opts: { modifiedSince?: Date }): Promise<any[]>;
  applyState: typeof applyXeroClientInvoiceState;
  store: any;
}

const liveDeps: ReconcileDeps = {
  async getConnection(companyId) {
    const { storage } = await import("../storage");
    return storage.getXeroConnectionByCompanyId(companyId).catch(() => null) as any;
  },
  async listLinkedInvoices(companyId) {
    const { and, eq, isNotNull } = await import("drizzle-orm");
    const { db } = await import("../db");
    const schema = await import("@shared/schema");
    return db
      .select()
      .from(schema.clientInvoices)
      .where(and(
        eq(schema.clientInvoices.companyId, companyId),
        isNotNull(schema.clientInvoices.xeroInvoiceId),
      )) as any;
  },
  async listXeroInvoices(connectionId, opts) {
    const { xeroService } = await import("./xeroService");
    return xeroService.listAllBills(connectionId, {
      type: "ACCREC",
      statuses: STATUSES,
      modifiedSince: opts.modifiedSince,
    });
  },
  applyState: applyXeroClientInvoiceState,
  store: null,
};

export async function reconcileClientInvoicesWithXero(
  companyId: string,
  opts: { modifiedSince?: Date } = {},
  deps: ReconcileDeps = liveDeps,
): Promise<ClientInvoiceReconcileReport> {
  const empty: ClientInvoiceReconcileReport = { connected: false, checked: 0, changed: 0, missingInXero: 0 };

  // Live path only: resolve storage on first use, for the same reason the
  // rest of liveDeps is lazy.
  if (deps === liveDeps && !deps.store) {
    deps.store = (await import("../storage")).storage;
  }

  const connection = await deps.getConnection(companyId);
  if (!connection || !connection.isActive) return empty;

  // Only invoices that were pushed to Xero can be matched back. One created
  // directly in Xero has no link and is invisible to this — by design, not an
  // oversight: there is nothing here to reconcile it against.
  const linked = await deps.listLinkedInvoices(companyId);

  if (linked.length === 0) return { ...empty, connected: true };

  const byXeroId = new Map<string, any>(linked.map((i: any) => [i.xeroInvoiceId as string, i]));

  // One paged pull, not one request per invoice — the same shape the bills
  // sweep uses, so a long ledger cannot burst Xero's rate limit.
  const xeroInvoices = await deps.listXeroInvoices(connection.id, { modifiedSince: opts.modifiedSince });

  let checked = 0;
  let changed = 0;
  const seen = new Set<string>();

  for (const xInv of xeroInvoices) {
    const xeroId = xInv?.InvoiceID;
    if (!xeroId) continue;
    const local = byXeroId.get(xeroId);
    if (!local) continue; // someone else's invoice in the same Xero org
    seen.add(xeroId);
    checked++;

    const before = { status: local.status, paidAmount: local.paidAmount };
    try {
      await deps.applyState(deps.store, {
        invoice: local,
        xeroInvoice: xInv,
        recordedBy: null,
        source: "webhook",
        reference: "Xero nightly reconcile",
      });
      const after = await deps.store.getClientInvoice(local.id);
      if (after && (after.status !== before.status || (after.paidAmount || 0) !== (before.paidAmount || 0))) {
        changed++;
      }
    } catch (e) {
      // One bad invoice must not abandon the rest of the ledger.
      console.error(`[xeroClientReconcile] ${companyId}: invoice ${local.id} failed:`, e);
    }
  }

  return {
    connected: true,
    checked,
    changed,
    missingInXero: linked.length - seen.size,
  };
}
