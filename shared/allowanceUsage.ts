// Where an allowance (a PC/PS estimate item) has been used, and what that
// means for editing it. Shared by the server (which enforces the rules) and the
// client (which greys out pickers and shows the lock banner).
//
// The rules (Jed, 2026-11-26):
//  - Only a FINALISED allowance can go on a variation or a client invoice.
//  - An allowance can be on at most ONE variation (rejected ones don't count).
//    Client invoices still claim an allowance by % across several invoices.
//  - While it is on a variation or an invoice it is locked: nothing that
//    changes its cost can be edited and its status stays finalised.
//      - Removable lock: the variation/invoice is still a draft (or awaiting
//        the client). Take the allowance off it to unlock.
//      - Permanent lock: the variation is approved, or the invoice has been
//        issued (approved / sent / part paid / paid).

import { isApprovedVariationStatus } from "./projectMetrics";
import { isIssuedInvoice } from "./invoiceMetrics";

export const FINALISED_ALLOWANCE_STATUS = "finalized";

export function isFinalisedAllowance(status: string | null | undefined): boolean {
  const k = (status || "").toLowerCase();
  return k === "finalized" || k === "finalised";
}

export type AllowanceUseKind = "variation" | "invoice";

export interface AllowanceUse {
  kind: AllowanceUseKind;
  /** variation id or client invoice id */
  id: string;
  /** variationNumber / invoiceNumber, for display */
  number: string | null;
  status: string;
  /** true when the allowance can never be unlocked from this use */
  permanent: boolean;
}

/** Variations that no longer hold an allowance. */
export function isReleasingVariationStatus(status: string | null | undefined): boolean {
  return status === "rejected";
}

/** Invoices that no longer hold an allowance. */
export function isReleasingInvoiceStatus(status: string | null | undefined): boolean {
  return status === "rejected" || status === "cancelled";
}

export function isPermanentVariationUse(status: string | null | undefined): boolean {
  return isApprovedVariationStatus(status);
}

export function isPermanentInvoiceUse(status: string | null | undefined): boolean {
  return !!status && isIssuedInvoice(status);
}

/** The description an imported allowance line is written with. Older lines
 *  carry no link to their allowance, so this is how they are recognised. */
export function allowanceAdjustmentDescription(name: string): string {
  return `${name} — allowance adjustment`;
}

export function describeAllowanceUse(use: AllowanceUse): string {
  const label = use.kind === "variation" ? "variation" : "invoice";
  return use.number ? use.number : `a ${label}`;
}
