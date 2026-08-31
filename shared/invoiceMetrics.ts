// Canonical client-invoice money definitions.
//
// These used to be re-derived inline in two places — the /client-invoices page
// header and the CASH dashboard's Invoices Summary widget — and the two
// disagreed. Both now go through this module so "Invoiced" and "Outstanding"
// mean exactly one thing wherever they are rendered.
//
// All amounts are integer CENTS inc GST (client_invoices.* money columns are
// inc-GST cents — see shared/money.ts).

/** Cancelled invoices are void: they never count toward any total. */
export const CANCELLED_INVOICE_STATUS = "cancelled";

/** A draft has not been issued to the client, so it is not yet revenue. */
export const DRAFT_INVOICE_STATUS = "draft";

/**
 * Statuses that mean "this invoice has left the builder's desk".
 *
 * `overdue` is never stored (see client/src/lib/invoiceStatus.ts) but is
 * accepted here so callers may pass either the raw or the derived status.
 */
export const ISSUED_INVOICE_STATUSES: ReadonlySet<string> = new Set([
  "approved",
  "sent",
  "partial",
  "overdue",
  "paid",
]);

export interface InvoiceMoneyRow {
  status: string;
  totalAmount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  invoicingMethod?: string | null;
}

/** Void invoices are excluded from every metric. */
export function isCountableInvoice(status: string): boolean {
  return status !== CANCELLED_INVOICE_STATUS;
}

/**
 * Has this invoice been issued to the client?
 *
 * This is the gate for "invoiced to date": a draft is a builder-side working
 * document, so counting it as invoiced overstates revenue and drives
 * "% of contract" and "remaining to invoice" to the wrong answer.
 */
export function isIssuedInvoice(status: string): boolean {
  return isCountableInvoice(status) && ISSUED_INVOICE_STATUSES.has(status);
}

export function invoiceTotalCents(inv: InvoiceMoneyRow): number {
  return inv.totalAmount || 0;
}

/**
 * What the client still owes on this invoice.
 *
 * Prefers the stored balance and falls back to total − paid for legacy rows
 * that never populated it. A partially-paid invoice has a real non-zero
 * balance — that remainder IS outstanding money, which is precisely what the
 * dashboard widget used to miss.
 */
export function invoiceBalanceCents(inv: InvoiceMoneyRow): number {
  if (inv.balanceAmount != null) return inv.balanceAmount;
  return (inv.totalAmount || 0) - (inv.paidAmount || 0);
}

export interface InvoiceSummary {
  /** Issued (non-draft, non-cancelled) invoice value — the real "invoiced to date". */
  invoicedCents: number;
  issuedCount: number;
  /** Issued value raised against contract scope (excludes cost-plus invoices). */
  contractInvoicedCents: number;
  /** Money still owed: unpaid balance across every ISSUED invoice, partials included. */
  outstandingCents: number;
  outstandingCount: number;
  paidCents: number;
  paidCount: number;
  partialCents: number;
  partialCount: number;
  draftCents: number;
  draftCount: number;
  countableCount: number;
}

/**
 * Single pass over a project's invoices producing every headline figure.
 *
 * The two rules that matter:
 *   1. "Invoiced" counts ISSUED invoices only — never drafts.
 *   2. "Outstanding" is a sum of BALANCES, not of totals, so the unpaid
 *      remainder of a partially-paid invoice is included.
 */
export function summariseInvoices(rows: readonly InvoiceMoneyRow[]): InvoiceSummary {
  const summary: InvoiceSummary = {
    invoicedCents: 0,
    issuedCount: 0,
    contractInvoicedCents: 0,
    outstandingCents: 0,
    outstandingCount: 0,
    paidCents: 0,
    paidCount: 0,
    partialCents: 0,
    partialCount: 0,
    draftCents: 0,
    draftCount: 0,
    countableCount: 0,
  };

  for (const inv of rows) {
    if (!isCountableInvoice(inv.status)) continue;
    summary.countableCount++;

    const total = invoiceTotalCents(inv);

    if (inv.status === DRAFT_INVOICE_STATUS) {
      summary.draftCents += total;
      summary.draftCount++;
      continue;
    }

    if (!isIssuedInvoice(inv.status)) continue;

    summary.invoicedCents += total;
    summary.issuedCount++;

    // Cost-plus invoices bill actual costs, not contract scope, so they must
    // not reduce the contract remainder.
    if (inv.invoicingMethod !== "cost_plus") {
      summary.contractInvoicedCents += total;
    }

    const balance = invoiceBalanceCents(inv);
    if (balance > 0) {
      summary.outstandingCents += balance;
      summary.outstandingCount++;
    }

    if (inv.status === "paid") {
      summary.paidCents += total;
      summary.paidCount++;
    }
    if (inv.status === "partial") {
      summary.partialCents += total;
      summary.partialCount++;
    }
  }

  return summary;
}
