---
name: Client invoice paid recompute paths
description: clientInvoices.paidAmount/balanceAmount/status are stored columns — every payment mutation path must recompute them from non-voided rows, like bills.
---

`clientInvoices` stores `paidAmount`, `balanceAmount`, and `status` as columns; the
frontend reads them directly (it does NOT sum payment rows client-side). So those
columns are only correct if EVERY payment mutation path keeps them in sync.

**The rule:** any create / void / delete of a `clientInvoicePayments` row must
recompute the invoice columns from the **non-voided** payment rows
(`isVoided=false`), exactly like bills do via `syncBillPaidStatus`. The client-invoice
equivalent is `syncClientInvoicePaidStatus(invoiceId)` in `DbStorage`.

**Why:** voiding a payment originally only set `isVoided=true` and never recomputed
the columns, so a voided payment kept counting as "Paid" → invoice Paid > Total and
project Outstanding went negative. Bills never had this bug because their void/delete
paths call the recompute.

**How to apply:**
- `voidClientInvoicePayment` / `deleteClientInvoicePayment` call `syncClientInvoicePaidStatus`.
- `balanceAmount` is clamped to `Math.max(0, total - paid)` (matches Xero paths) so
  overpayment never yields negative Outstanding.
- The manual record-payment flow still updates the columns from the **frontend**
  (POST payment row, then PATCH the invoice) — this is the one path that does NOT go
  through the storage recompute. Keep it consistent (sum of non-voided rows == paidAmount).
- `createClientInvoicePayment` deliberately does NOT auto-sync: the Xero import paths
  call it and set `paidAmount` directly from Xero, so auto-syncing there risks clobbering
  the Xero-authoritative value.

**Gotcha — security:** the entire `/api/client-invoices` route family (invoices, items,
payments: GET/POST/PATCH/DELETE) has NO `requireAuth` and NO company scoping, unlike the
bill routes which enforce both. Only `PATCH /api/client-invoice-payments/:id/void` has
`requireAuth`. This is a pre-existing, app-wide gap — fixing it is a cross-cutting change.
