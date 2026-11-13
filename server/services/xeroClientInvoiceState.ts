/**
 * One place where a Xero invoice's state becomes a Morada client invoice's
 * state.
 *
 * The webhook and the manual Sync button both go through here. They used to
 * carry a copy each, and the copies had drifted: the webhook mirrored payments
 * and voids but NOT SentToContact, so an invoice sent from inside Xero sat on
 * "approved" in Morada until somebody pressed Sync. That is why client
 * invoices looked like they did not sync by themselves — the webhook was
 * arriving and quietly doing less than the button.
 *
 * Storage is injected so this can be tested without a Xero connection.
 */

/** Only the writes this needs — keeps the seam small and the test honest. */
export interface ClientInvoiceStateStore {
  updateClientInvoice(id: string, patch: Record<string, unknown>): Promise<unknown>;
  createClientInvoicePayment(row: Record<string, unknown>): Promise<unknown>;
  syncClientInvoicePaidStatus(id: string): Promise<unknown>;
}

export interface XeroInvoiceLike {
  Status?: string;
  AmountPaid?: number;
  AmountDue?: number;
  SentToContact?: boolean;
}

export interface LocalInvoiceLike {
  id: string;
  status?: string | null;
  paidAmount?: number | null;
}

export interface ApplyArgs {
  invoice: LocalInvoiceLike;
  xeroInvoice: XeroInvoiceLike;
  recordedBy?: string | null;
  /** Only shapes the audit trail on the payment row. */
  source: "webhook" | "manual";
  reference?: string;
}

export interface ApplyResult {
  xeroStatus: string;
  amountPaidCents: number;
  amountDueCents: number;
}

export async function applyXeroClientInvoiceState(
  store: ClientInvoiceStateStore,
  args: ApplyArgs,
): Promise<ApplyResult> {
  const { invoice, xeroInvoice, recordedBy = null, source } = args;
  const amountPaidCents = Math.round((xeroInvoice.AmountPaid || 0) * 100);
  const amountDueCents = Math.round((xeroInvoice.AmountDue || 0) * 100);
  const xeroStatus: string = xeroInvoice.Status ?? "";

  // Xero keeps "sent" off the status axis entirely — it is a SentToContact
  // flag on the invoice. Mirror it so an invoice sent from inside Xero still
  // reads as sent here. Guarded on draft/approved so it can never walk
  // backwards over a payment state.
  if (xeroInvoice.SentToContact && (invoice.status === "approved" || invoice.status === "draft")) {
    await store.updateClientInvoice(invoice.id, { status: "sent" });
  }

  // Record a Xero-side payment increase as a payment ROW, then let
  // syncClientInvoicePaidStatus recompute paid/balance/status from the rows —
  // the single writer for paid state. Never overwrite paidAmount with Xero's
  // absolute figure, which silently clobbers payments recorded only here.
  if (amountPaidCents > (invoice.paidAmount || 0)) {
    const diff = amountPaidCents - (invoice.paidAmount || 0);
    await store.createClientInvoicePayment({
      invoiceId: invoice.id,
      amount: diff,
      paymentDate: new Date(),
      paymentMethod: source === "webhook" ? "Xero Webhook" : "Xero Sync",
      reference: args.reference ?? (source === "webhook" ? "Xero webhook" : "Synced from Xero"),
      notes: null,
      isVoided: false,
      recordedBy,
    });
    // createClientInvoicePayment already ran the sync.
  } else {
    await store.syncClientInvoicePaidStatus(invoice.id);
  }

  // VOIDED/DELETED in Xero: the copy this invoice pointed at is gone, so the
  // link goes — the invoice can then be re-approved or linked to the copy
  // that survives. It used to ALSO force "draft", which ran straight over
  // payments recorded here: a fully paid invoice whose duplicate was deleted
  // in Xero sat on Draft (6705-CI-004). Payments decide the status; only an
  // unpaid invoice goes back to draft.
  if (xeroStatus === "VOIDED" || xeroStatus === "DELETED") {
    const hasPayments = (invoice.paidAmount || 0) > 0;
    await store.updateClientInvoice(invoice.id, {
      xeroInvoiceId: null,
      xeroInvoiceNumber: null,
      ...(hasPayments ? {} : { status: "draft" }),
    });
  }

  return { xeroStatus, amountPaidCents, amountDueCents };
}
