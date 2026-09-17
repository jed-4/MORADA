/**
 * What a CLIENT is allowed to see of builder records.
 *
 * Every function here is a projection: it builds a new object from an
 * explicit list of fields rather than deleting the sensitive ones from a copy.
 * A column added to the table later therefore stays server-side until someone
 * deliberately adds it here — the failure mode of a deny-list is a silent
 * leak, the failure mode of an allow-list is a missing field on a screen.
 *
 * Shared by the emailed token portals and the logged-in client session (see
 * server/middleware/clientAccess.ts), so the two can never disagree about what
 * the client is shown.
 */
import type { VariationDocumentColumns } from "@shared/variationDocumentColumns";

// ── Variations ──────────────────────────────────────────────────────────────

/**
 * Statuses a client may see. "draft" and "action" are unsent builder working
 * states — sending a variation moves it to "pending" (see the send route).
 */
export const CLIENT_VISIBLE_VARIATION_STATUSES = new Set(["pending", "approved", "rejected"]);

export function isVariationClientVisible(variation: { status?: string | null } | null | undefined): boolean {
  return !!variation && CLIENT_VISIBLE_VARIATION_STATUSES.has(String(variation.status));
}

/**
 * The variation row as the client sees it. Deliberately excludes portalToken
 * (a bearer credential), signer IP/user-agent, createdById/approvedBy,
 * pdfColumns, relatedTo and revision-chain ids.
 */
export function projectClientVariation(variation: any) {
  return {
    id: variation.id,
    variationNumber: variation.variationNumber,
    name: variation.name,
    introductionText: variation.introductionText,
    closingText: variation.closingText,
    approvalDeadline: variation.approvalDeadline,
    daysChanged: variation.daysChanged,
    // The document-level markup is a charge on the client's own document, so it
    // is theirs to see. Per-line markup is deliberately NOT exposed: it lives in
    // variation_items.markupPercent and stays server-side.
    globalMarkupPercent: variation.globalMarkupPercent,
    globalMarkupAmount: variation.globalMarkupAmount,
    subtotal: variation.subtotal,
    gstAmount: variation.gstAmount,
    totalAmount: variation.totalAmount,
    status: variation.status,
    rejectionReason: variation.rejectionReason,
    termsAndConditions: variation.termsAndConditions,
    attachments: variation.attachments,
    clientSignedName: variation.clientSignedName,
    clientSignedDate: variation.clientSignedDate,
    builderSignedName: variation.builderSignedName,
    builderSignedDate: variation.builderSignedDate,
    portalSentAt: variation.portalSentAt,
    createdAt: variation.createdAt,
  };
}

/**
 * Variation lines as the client sees them, honouring the document's column
 * settings. Lines the builder marked "hide from client" (showInPdf=false) are
 * dropped; callers that need the document to add up report their value as a
 * single "not itemised" figure.
 *
 * `costCodeLabels` maps cost code id → "code - title"; only consulted when the
 * cost code column is shown.
 */
export function projectClientVariationItems(
  items: any[],
  documentColumns: VariationDocumentColumns,
  costCodeLabels: Record<string, string> = {},
) {
  return items
    .filter((item: any) => item.showInPdf !== false)
    .map((item: any) => ({
      id: item.id,
      ...(documentColumns.name ? { name: item.name } : {}),
      ...(documentColumns.description ? { description: item.description } : {}),
      ...(documentColumns.costCode
        ? { costCode: item.costCode ? costCodeLabels[item.costCode] ?? item.costCode : null }
        : {}),
      ...(documentColumns.quantity ? { quantity: item.quantity } : {}),
      ...(documentColumns.unit ? { unitType: item.unitType } : {}),
      // The two that expose the builder's buy price and margin. These are
      // the reason this stripping exists at all — off by default, and when
      // off they must not appear in the payload at any price.
      ...(documentColumns.unitCost ? { unitCostExTax: item.unitCostExTax } : {}),
      ...(documentColumns.markupPercent || documentColumns.markupAmount
        ? { markupPercent: item.markupPercent }
        : {}),
      ...(documentColumns.unitPrice ? { unitPrice: item.unitPrice } : {}),
      // totalPrice always ships, even with both amount columns hidden: the
      // group subtotals, the derived margin row and the Total are all
      // computed from it, so withholding it would stop the document adding
      // up. Turning the amount columns off is therefore presentational
      // here, unlike cost and markup above. A builder who wants a line's
      // money to genuinely not reach the client should clear that line's
      // "PDF" checkbox instead, which collapses it into the single
      // "Additional works (not itemised)" figure.
      totalPrice: item.totalPrice,
      taxable: item.taxable,
      itemType: item.itemType,
      type: item.type,
      sortOrder: item.sortOrder,
    }));
}

// ── Client invoices (progress claims) ───────────────────────────────────────

/**
 * Only invoices that have actually gone to the client. "draft" is unfinished
 * and "approved" is authorised internally but not yet sent (Jed, 2026-09-17).
 */
export const CLIENT_VISIBLE_INVOICE_STATUSES = new Set(["sent", "partial", "paid", "overdue"]);

export function isInvoiceClientVisible(invoice: { status?: string | null } | null | undefined): boolean {
  return !!invoice && CLIENT_VISIBLE_INVOICE_STATUSES.has(String(invoice.status));
}

/**
 * Excludes internal notes, every Xero field (ids, push flag, per-line account
 * and tracking overrides) and companyId/clientId. The line breakdown keeps its
 * client-facing money but loses the resolved account code.
 */
export function projectClientInvoice(invoice: any) {
  const breakdown = Array.isArray(invoice.lineBreakdown)
    ? invoice.lineBreakdown.map((line: any) => ({
        source: line.source,
        description: line.description,
        amountExCents: line.amountExCents,
        gstCents: line.gstCents,
        amountIncCents: line.amountIncCents,
        taxable: line.taxable,
      }))
    : null;
  const attachments = Array.isArray(invoice.attachments)
    ? invoice.attachments.filter((a: any) => a?.includeInPdf !== false)
    : [];
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    name: invoice.name,
    projectId: invoice.projectId,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    invoicingMethod: invoice.invoicingMethod,
    introductionText: invoice.introductionText,
    closingText: invoice.closingText,
    termsAndConditions: invoice.termsAndConditions,
    subtotal: invoice.subtotal,
    markupAmount: invoice.markupAmount,
    gstAmount: invoice.gstAmount,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    balanceAmount: invoice.balanceAmount,
    status: invoice.status,
    sentDate: invoice.sentDate,
    showAmountsIncTax: invoice.showAmountsIncTax,
    lockedContractPrice: invoice.lockedContractPrice,
    contractClaimRows: invoice.contractClaimRows,
    lineBreakdown: breakdown,
    attachments,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

/** Custom invoice lines without cost code or Xero account. */
export function projectClientInvoiceItem(item: any) {
  return {
    id: item.id,
    invoiceId: item.invoiceId,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    taxable: item.taxable,
    sortOrder: item.sortOrder,
    unit: item.unit,
  };
}

/** Voided payments are dropped; internal notes and the recording user are not sent. */
export function projectClientInvoicePayments(payments: any[]) {
  return payments
    .filter((p: any) => !p.isVoided)
    .map((p: any) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      amount: p.amount,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      reference: p.reference,
    }));
}

// ── Allowances ──────────────────────────────────────────────────────────────

/**
 * Which estimate's allowances the client sees: the project's selected estimate;
 * else any estimate at "contract" status; else any "approved" one. An approved
 * (often locked) estimate that was never flipped to contract is still the
 * agreed job — the dev Irwin project is exactly that. Draft and archived
 * versions are never shown — they are the builder's working copies.
 */
export function clientAllowanceEstimateIds(
  project: { selectedEstimateId?: string | null } | null | undefined,
  estimates: Array<{ id: string; status?: string | null }>,
): Set<string> {
  if (project?.selectedEstimateId) return new Set([project.selectedEstimateId]);
  for (const status of ["contract", "approved"]) {
    const ids = estimates.filter((e) => e.status === status).map((e) => e.id);
    if (ids.length > 0) return new Set(ids);
  }
  return new Set();
}

/**
 * One allowance row as the client sees it (input is a row from
 * storage.getProjectAllowances). No money at all yet: bills, suppliers,
 * timesheets, staff rates, unit costs and markup never leave the server, and
 * neither does the allowance amount.
 *
 * Why not even the amount: getProjectAllowances' priceIncTax is the line's
 * PRE-MARGIN figure (project markup is applied once at the estimate subtotal),
 * so it is not the number on the client's contract. Showing it would put a
 * figure in front of the client that disagrees with their proposal.
 * TODO(client-portal allowances PR): once-finalised allowance vs final client
 * price + difference, computed with the margin the proposal used.
 */
export function projectClientAllowance(row: any) {
  const item = row?.item ?? {};
  const finalised = item.allowanceStatus === "finalized";
  return {
    item: {
      id: item.id,
      estimateId: item.estimateId,
      name: item.shownAs || item.name,
      description: item.description,
      groupName: item.groupName ?? null,
      groupOrder: item.groupOrder ?? null,
      order: item.order,
      allowance: item.allowance,
      allowanceStatus: item.allowanceStatus,
      isSelection: item.isSelection,
    },
    finalised,
  };
}
