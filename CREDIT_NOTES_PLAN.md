# Vendor Credits → Xero Credit Notes — Implementation Spec

**Status:** proposed, not started
**Date:** 2026-08-04
**Related:** `morada-bill-approval-xero-push` (PR #15), `morada-xero-paid-bill-sync`, `morada-bills-overhaul-plan` (PRs #17→#19)

---

## 0. Current state

Vendor credits are a **local-only** concept that is **actively mis-synced** to Xero.

**What works.** `billType` is `bill | credit | receipt` ([shared/schema.ts:1631](shared/schema.ts#L1631)). The bill form exposes **Type → Vendor Credit** ([BillDetail.tsx:2117](client/src/pages/BillDetail.tsx#L2117)). Amounts are stored **positive** and negated at read time — Bills list shows green/negative ([Bills.tsx:1146](client/src/pages/Bills.tsx#L1146)), outstanding-due subtracts ([Bills.tsx:106](client/src/pages/Bills.tsx#L106)), budget actuals subtract ([storage.ts:19031](server/storage.ts#L19031), [routes.ts:17192](server/routes.ts#L17192)).

**What's broken.**

| # | Defect | Location |
|---|---|---|
| **D1** | Push hardcodes `Type: "ACCPAY"`; the payload never carries `billType`. A vendor credit pushes as a **normal supplier bill with positive amounts** — it *increases* payables in Xero. No guard blocks it. | [xeroService.ts:839](server/services/xeroService.ts#L839), [:906](server/services/xeroService.ts#L906), [routes.ts:719](server/routes.ts#L719) |
| **D2** | No `/CreditNotes` call exists anywhere in `xeroService`. | — |
| **D3** | Import route hard-refuses non-`ACCPAY`; `syncBillFromXeroInternal` never sets `billType`. Credits raised in Xero can't come back. | [routes.ts:35511](server/routes.ts#L35511), [:873](server/routes.ts#L873) |
| **D4** | The `CREDITNOTE` webhook branch is dead code — it resolves via `getInvoice`, which GETs `/Invoices/{id}`. A `CreditNoteID` isn't there, so it 404s and bails every time. | [routes.ts:34987](server/routes.ts#L34987), [xeroService.ts:1294](server/services/xeroService.ts#L1294) |
| **D5** | `recomputePOStatusFromBills` sums `paidAmount`/`total` across linked bills with no `billType` awareness — a credit linked to a PO pushes the PO toward `paid` in the **wrong direction**. | [poStatusFromBills.ts:54](server/services/poStatusFromBills.ts#L54) |
| **D6** | `reconcileBillsWithXero` only pulls `Type=="ACCPAY"`, so any locally-linked credit is invisible to the nightly sweep and shows up in `notInXero`. | [routes.ts:1100](server/routes.ts#L1100), [xeroService.ts:1154](server/services/xeroService.ts#L1154) |

> **D1 is the live risk.** Any vendor credit already pushed has created a bogus payable in the customer's Xero file. Remediation is §8.

---

## 1. Design decisions

### 1.1 One table, discriminated by `billType` — **not** a separate `credit_notes` table

Credits stay rows in `bills`. Rationale: budget actuals, cost-code attribution, project linkage, attachments, approvals, AI reading, and the whole Bills UI already work on `bills` and already understand `billType === "credit"`. A parallel table would fork all of it. The cost is a `billType` branch at every Xero boundary — enumerated exhaustively in §3–§5.

### 1.2 Reuse `xeroInvoiceId` to hold the `CreditNoteID`

Xero GUIDs are globally unique across resources, so there's no collision risk, and this keeps working unchanged: `storage.getBillByXeroId`, the `bills_company_xero_invoice_unique` partial index, the webhook lookup, and the reconcile join. The document *type* is carried by `billType`, which is already on the row.

The cost: every `getInvoice(bill.xeroInvoiceId)` call must dispatch on type. Solved once, in §3.4, with a `getXeroDocument(connectionId, bill)` resolver. **Any new code that calls `getInvoice` directly on a bill's `xeroInvoiceId` is a bug** — add a lint note in the service header.

### 1.3 Reuse `paidAmount` as "settled cents"

For a credit, *settled* = allocated to bills + refunded in cash. Reusing `paidAmount` means the existing due math (`total - paidAmount`, negated for credits) yields **remaining credit** with zero UI change, and `status: paid` cleanly means "fully used up".

Trade-off: the column name lies for credits, and any consumer that reads `paidAmount` as literal cash out is now wrong. There are two such consumers and both are already wrong today (D5, and the Bills summary tiles) — both get a `billType` guard in §6. Documented in the schema comment.

*Alternative rejected:* a separate `appliedAmount` column. Cleaner semantics, but forks the due math, the status machine, and the payments panel for one document type.

### 1.4 Numbering: shared `BILL-` sequence for v1

`getNextBillNumber` is company-scoped and prefix-driven from system config ([storage.ts:15577](server/storage.ts#L15577)). Giving credits their own `VC-` prefix means a second sequence, a second config field, and a second regex scan. Not worth it for v1 — the list already badges credits distinctly. Revisit if Jed wants it; it's an additive change (`systemConfiguration.creditPrefix` + a `billType`-aware `getNextBillNumber`).

### 1.5 Raise-only — **DECIDED 2026-08-04 (Jed)**

Morada raises the credit note and pushes it to Xero. **Allocating it against specific bills happens in Xero**, at the point of payment. Morada does not initiate allocations.

Rationale: the payment itself happens in Xero/the bank, so the netting that matters for actually paying a supplier is Xero's, and Xero does it natively in one click. Budget actuals, project costs, and supplier-level owing are correct in Morada without any allocation model — the credit subtracts the moment it exists.

**This decision is only viable because of §1.5.1.** Without reading the allocation result back, raise-only leaves Morada's per-bill figures visibly wrong.

Phase 3 (§3.7, §7.5, and the `bill_credit_allocations` table in §2) is retained in this spec as an unbuilt option. If it's ever wanted, the read model will already be correct, so it shrinks to just the write path.

### 1.5.1 Read `AmountCredited` — required, not optional

Xero keeps credit allocations **separate from payments** on an invoice: `AmountDue = Total − AmountPaid − AmountCredited`. Morada reads `AmountCredited` **nowhere** — every paid-state path uses `AmountPaid` alone ([routes.ts:898](server/routes.ts#L898) sync, [:1035](server/routes.ts#L1035) reconcile diff, [:34831](server/routes.ts#L34831) payment webhook, [:35040](server/routes.ts#L35040)/[:35104](server/routes.ts#L35104), [:35610](server/routes.ts#L35610) import).

Consequence today: allocate a credit in Xero and the bill syncs to status `paid` while `paidAmount` stays $0 — Morada shows **"Paid $0 · Due $5,000" next to a Paid badge**. This is a live bug independent of credit notes; raise-only makes it routine.

**Model it as a separate column, not folded into `paidAmount`.** Add `bills.credited_amount` (cents) and make due `total − paidAmount − creditedAmount`. Conflating would make a bill read "Paid $5,000" when no money moved — unacceptable in an accounting product, and these numbers get quoted to accountants. Separate fields give an honest "Paid $0 · Credited $800 · Due $4,200".

This is what makes raise-only work end to end: raise in Morada → push → allocate in Xero → **the bill's amount owing in Morada corrects itself**.

### 1.6 Explicitly out of scope

- **Cash refunds** against a credit note (Xero models these as `Payments` on the credit note). Out for v1; the sync in §5 reads them correctly into `paidAmount` if a bookkeeper records one in Xero, but Morada offers no way to create one.
- **`ACCRECCREDIT`** (credit notes *to clients*). That's the client-invoices roadmap, not this.
- **`billType: "receipt"`** stays `ACCPAY` — receipts are worker reimbursements and are genuinely payables. Guards must special-case `"credit"` only, never `!== "bill"`.
- Multi-currency. Everything assumes the org's base currency, same as bills today.

---

## 2. Data model

### Migration `0040_credit_notes.sql`

> **Number checked 2026-08-04.** `0036` is claimed by `feat/allowances`, `0037` is in main (checklist), and **`0038` + `0039` are claimed by `feat/rfq`** — all unmerged. `0040` is the first free number today. **Re-check before writing the file**, because whichever of those branches merges first shifts the landscape; `git ls-tree --name-only origin/<branch> migrations/` across the remote branches is the way to confirm.

```sql
-- Xero keeps credit allocations separate from payments:
--   AmountDue = Total - AmountPaid - AmountCredited
-- Mirror that rather than folding credits into paid_amount, so a bill never
-- claims money moved when it didn't. See §1.5.1.
ALTER TABLE bills ADD COLUMN credited_amount integer NOT NULL DEFAULT 0;

-- Credits settle by allocation, not payment. bills.paid_amount doubles as
-- "settled cents" for billType='credit' (allocated + refunded).
COMMENT ON COLUMN bills.paid_amount IS
  'Cents paid (billType=bill/receipt) or settled — allocated+refunded (billType=credit)';
COMMENT ON COLUMN bills.credited_amount IS
  'Cents offset by credit notes allocated in Xero (mirrors Xero AmountCredited). Always 0 on billType=credit rows.';

-- Phase 3 ONLY — not built. Retained for if allocation-from-Morada is ever wanted.
CREATE TABLE bill_credit_allocations (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_bill_id  varchar NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  target_bill_id  varchar NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount          integer NOT NULL,               -- cents, always positive
  allocation_date timestamp NOT NULL,
  xero_allocation_id text,                        -- Xero AllocationID, null until pushed
  is_voided       boolean NOT NULL DEFAULT false,
  created_by_id   varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX bill_credit_allocations_credit_idx ON bill_credit_allocations(credit_bill_id);
CREATE INDEX bill_credit_allocations_target_idx ON bill_credit_allocations(target_bill_id);
```

No change to `bills` columns. `billTypeEnum` already has `credit`.

**Prod:** several migrations (0032–0037 across merged and unmerged branches) are already prod-pending per the runbook — confirm the real applied state against prod before adding to the queue. Apply this one manually via `psql` against `ep-delicate-flower` (**real prod** — the Replit Shell DB is dev), in order, **before** deploying the code. Never `db:push`.

### Drizzle (`shared/schema.ts`)

Add `creditedAmount: integer("credited_amount").notNull().default(0)` to `bills` next to `paidAmount` (~line 1954), with the comment above. `insertBillSchema` gets `creditedAmount: z.number().default(0)`.

Phase 3 only: `billCreditAllocations` table + `insertBillCreditAllocationSchema` alongside `billPayments` (~line 2070). Amount is cents, positive, `z.number().int().positive()`.

---

## 3. `server/services/xeroService.ts`

### 3.1 `createCreditNote(connectionId, data: XeroCreditNoteData)`

Mirrors `createBill` ([:801](server/services/xeroService.ts#L801)) with these deltas:

| | `createBill` | `createCreditNote` |
|---|---|---|
| Endpoint | `POST /Invoices` | `POST /CreditNotes` |
| Body key | `{ Invoices: [...] }` | `{ CreditNotes: [...] }` |
| Type | `ACCPAY` | `ACCPAYCREDIT` |
| Number field | `InvoiceNumber` | `CreditNoteNumber` |
| `DueDate` | sent | **must not be sent** — credit notes have no due date |
| Response id | `Invoices[0].InvoiceID` | `CreditNotes[0].CreditNoteID` |

Everything else is identical and should be **factored out, not copy-pasted**: contact resolution (`findOrCreateContact`), the `LineItems` mapper (Description/Quantity/UnitAmount/TaxType/AccountCode/Tracking), `LineAmountTypes`, `Status`, `Reference`, `xeroFetchWithRetry` + `xeroErrorFromResponse`. Extract a private `buildXeroDocumentPayload()` used by all three of `createBill`/`updateBill`/`createCreditNote`.

**Amount sign: positive.** Xero credit notes carry positive totals; the document type conveys direction. This matches our storage convention exactly — no negation anywhere in the push path.

### 3.2 `updateCreditNote(connectionId, creditNoteId, data)`

`POST /CreditNotes/{CreditNoteID}`, body includes `CreditNoteID`. Same locked-document behaviour as invoices: once a credit note has allocations, Xero rejects line-item edits. That error text ("has payments or credit notes allocated") is already matched by the `invoiceLocked` self-heal at [routes.ts:784](server/routes.ts#L784) — extend the regex to also match `allocations` and make the user-facing copy type-aware ("This credit has been applied in Xero…").

### 3.3 `getCreditNote(connectionId, creditNoteId)`

`GET /CreditNotes/{CreditNoteID}`, returns `data.CreditNotes?.[0]`. Mirrors `getInvoice` ([:1294](server/services/xeroService.ts#L1294)).

### 3.4 `getXeroDocument(connectionId, bill)` — the dispatcher

```ts
// The ONLY correct way to fetch a bill row's Xero counterpart. Credits live at
// /CreditNotes, bills at /Invoices; a CreditNoteID 404s on /Invoices.
async getXeroDocument(connectionId: string, bill: { billType: string; xeroInvoiceId: string | null }) {
  if (!bill.xeroInvoiceId) return null;
  return bill.billType === "credit"
    ? this.getCreditNote(connectionId, bill.xeroInvoiceId)
    : this.getInvoice(connectionId, bill.xeroInvoiceId);
}
```

Every existing `getInvoice(conn, bill.xeroInvoiceId)` call site migrates to this. Call sites: [routes.ts:889](server/routes.ts#L889) (`syncBillFromXeroInternal`), [:34993](server/routes.ts#L34993) (webhook CREDITNOTE), [:35013](server/routes.ts#L35013) (webhook INVOICE), [:35505](server/routes.ts#L35505) (import). The import site is a special case — see §5.2.

### 3.5 `listCreditNotes` / `listAllCreditNotes`

Clone `listBills`/`listAllBills` ([:1140](server/services/xeroService.ts#L1140), [:1193](server/services/xeroService.ts#L1193)) against `GET /CreditNotes` with `where=Type=="ACCPAYCREDIT" AND (Status=="..." OR ...)`, `order=Date DESC`, page + `If-Modified-Since` identical. Returns `data.CreditNotes`.

### 3.6 Attachments

`getInvoiceAttachments` / `uploadInvoiceAttachment` / `downloadInvoiceAttachment` ([:941](server/services/xeroService.ts#L941)–[:1010](server/services/xeroService.ts#L1010)) hardcode `/Invoices/{id}/Attachments`. Add a `resource: "Invoices" | "CreditNotes"` parameter (default `"Invoices"`) rather than duplicating three methods, and thread it from `pushBillAttachmentsToXero`.

### 3.7 Allocations (Phase 3)

- `allocateCreditNote(connectionId, creditNoteId, { invoiceId, amount, date })` → `PUT /CreditNotes/{id}/Allocations`, body `{ Allocations: [{ Invoice: { InvoiceID }, Amount, Date }] }`. Returns `AllocationID`.
- `deleteCreditNoteAllocation(connectionId, creditNoteId, allocationId)` → `DELETE /CreditNotes/{id}/Allocations/{allocationId}`.

Xero preconditions: **both** documents must be `AUTHORISED`, same contact, same currency, and `Amount` ≤ the credit's `RemainingCredit` and ≤ the invoice's `AmountDue`. Pre-flight all four locally and return typed 422s (§7) rather than surfacing raw Xero text.

> Verify the exact field list against current Xero Accounting API docs during implementation — this spec is written from the API as known, and Xero has added fields over time.

---

## 4. Push path — `pushBillToXeroInternal` ([routes.ts:397](server/routes.ts#L397))

The function stays one function; it grows a `isCredit` branch. Order matters — the guards below sit at specific points in the existing flow.

**4.1 Top of function, after the bill load and tenancy check (~[:465](server/routes.ts#L465)):**

```ts
const isCredit = bill.billType === "credit";
```

**4.2 Paid/locked guard (~[:469](server/routes.ts#L469)).** Currently skips the push when `bill.status === "paid"`. For a credit, `paid` means "fully allocated" — Xero also rejects line edits on an allocated credit note, so the same guard applies unchanged. Only the message needs to be type-aware.

**4.3 Pre-flights (~[:620](server/routes.ts#L620)–[:675](server/routes.ts#L675)).** `MISSING_ACCOUNT_CODE` and `INVALID_TAX_TYPE` apply identically to credit notes — no change. The account-code fallback chain (line → supplier default → `companySettings.billDefaultXeroAccount`) is reused as-is; credits should code to the same expense account the original bill hit, and defaulting to the bills account is the right behaviour.

**4.4 Rounding line (~[:700](server/routes.ts#L700)).** Applies unchanged — `roundingCents` is signed and the credit's total is positive, so the same arithmetic holds.

**4.5 Status mapping (~[:688](server/routes.ts#L688)).** Unchanged: `awaiting_approval → SUBMITTED`, everything else `→ AUTHORISED`. Credit notes support both. **A credit note must reach `AUTHORISED` before it can be allocated** — worth a note in the Phase 3 UI.

**4.6 Payload + dispatch (~[:719](server/routes.ts#L719)):**

```ts
const docPayload = {
  supplierName,
  supplierXeroContactId,
  billDate: formatDate(bill.billDate),
  // Credit notes have no DueDate in Xero — omit it entirely.
  ...(isCredit ? {} : { dueDate: bill.dueDate ? formatDate(bill.dueDate) : undefined }),
  reference: bill.billNumber || undefined,
  // InvoiceNumber ⇄ CreditNoteNumber — both carry the supplier's own document number.
  documentNumber: bill.billReference || undefined,
  taxMode: (bill as any).taxMode === "inclusive" ? "inclusive" : "exclusive",
  lineItems: xeroLineItems,
  xeroStatus,
};

let xeroDoc: any;
if (isCredit) {
  xeroDoc = bill.xeroInvoiceId
    ? await xeroService.updateCreditNote(connection.id, bill.xeroInvoiceId, docPayload)
    : await xeroService.createCreditNote(connection.id, docPayload);
} else {
  xeroDoc = bill.xeroInvoiceId
    ? await xeroService.updateBill(connection.id, bill.xeroInvoiceId, docPayload)
    : await xeroService.createBill(connection.id, docPayload);
}
const newXeroId = xeroDoc?.CreditNoteID ?? xeroDoc?.InvoiceID;
```

Store `newXeroId` into `xeroInvoiceId` on create, exactly as today.

**4.7 Attachments (~[:748](server/routes.ts#L748)).** Pass `resource: isCredit ? "CreditNotes" : "Invoices"` through `pushBillAttachmentsToXero`.

**4.8 Return shape.** `xeroInvoiceId` / `xeroInvoiceNumber` keys stay (client reads them); populate from `CreditNoteID` / `CreditNoteNumber` for credits. Add `documentType: "bill" | "credit"` so the client can word its toast correctly.

**4.9 Auto-push queue ([:832](server/routes.ts#L832)).** `scheduleAutoPushBill` needs **no change** — its gating is on `status` and `sendToXero`, both of which mean the same thing for a credit. Verify with a test that a credit reaching `awaiting_approval` auto-pushes.

---

## 5. Pull path

### 5.1 `syncBillFromXeroInternal` ([routes.ts:873](server/routes.ts#L873))

Three changes:

1. **Fetch** via `getXeroDocument(connection.id, bill)` instead of `getInvoice` ([:889](server/routes.ts#L889)).
2. **Settled amount.** Credit notes have no `AmountPaid`. Compute:
   ```ts
   const settledCents = isCredit
     ? Math.round(((invoice.Total || 0) - (invoice.RemainingCredit ?? invoice.Total ?? 0)) * 100)
     : Math.round((invoice.AmountPaid || 0) * 100);
   ```
   `Total - RemainingCredit` covers allocations *and* cash refunds in one expression. Guard against `RemainingCredit` being absent (older/edge responses) by falling back to `Total` → settled 0, which is the safe direction.
3. **Reference mapping** ([:958](server/routes.ts#L958)): read `invoice.CreditNoteNumber` for credits, `invoice.InvoiceNumber` for bills, both into `billReference`.
4. **`creditedAmount` (§1.5.1)** — for `bill`/`receipt` rows, persist `Math.round((invoice.AmountCredited || 0) * 100)`. This is the whole payoff of the raise-only decision: it's how a credit allocated in Xero corrects the bill's amount owing in Morada. Credits themselves always write `creditedAmount: 0`.

The same `AmountCredited` read is needed at the four other paid-state sites: the reconcile diff ([:1035](server/routes.ts#L1035) — otherwise every allocated bill reports as diverged forever), the payment webhook ([:34831](server/routes.ts#L34831)), and both import paths ([:35104](server/routes.ts#L35104), [:35610](server/routes.ts#L35610)).

Status mapping, the never-demote-a-paid-bill guard, the draft-only line-item overwrite, `recalcProjectBudget`, and the VOIDED/DELETED → draft handling all apply unchanged. `PAID` on a credit note means fully allocated, which maps correctly to local `paid`.

### 5.2 Import from Xero ([routes.ts:35511](server/routes.ts#L35511))

Today: `if (xeroInvoice.Type !== "ACCPAY") → refuse`. Change to accept `ACCPAYCREDIT` and stamp the row:

```ts
const isCreditDoc = xeroDoc.Type === "ACCPAYCREDIT";
if (xeroDoc.Type !== "ACCPAY" && !isCreditDoc) {
  results.push({ xeroInvoiceId, ok: false, error: "Not a supplier bill or credit note — refusing to import" });
  continue;
}
// …
billType: isCreditDoc ? "credit" : "bill",
```

Two knock-ons:

- **Fetch dispatch.** The import loop calls `getInvoice(connection.id, xeroInvoiceId)` before it knows the type ([:35505](server/routes.ts#L35505)). Fix at the *preview* layer: `importPreviewHandler` already knows each document's type from the list call, so have the preview return `type` per row and have the import POST body carry `xeroDocuments: Array<{ id, type }>` instead of bare `xeroInvoiceIds`. Keep accepting the old array shape (assume `ACCPAY`) for one release so a stale client doesn't break.
- **Preview list.** `importPreviewHandler` must union `listAllBills` + `listAllCreditNotes`, tag each row with its type, and re-sort by date. The UI shows a "Credit" badge on credit rows. The existing supplier-matching, project-assignment, cost-code-from-tracking, and status-choice logic all apply unchanged.
- `paidAmount` on import uses the same `Total - RemainingCredit` expression as §5.1.

### 5.3 Webhook ([routes.ts:34987](server/routes.ts#L34987))

The `CREDITNOTE` branch becomes live by swapping `getInvoice` → `getCreditNote`. Fix the stale comment while you're there. Also relax the type check in the INVOICE branch ([:35018](server/routes.ts#L35018)) — it already tolerates `ACCPAYCREDIT`, which is now reachable and correct.

`PAYMENT` events that reference a credit note (a refund) resolve through the same `getBillByXeroId` path; verify the handler doesn't assume `Invoice` is present on the payment object.

### 5.4 Reconcile ([routes.ts:1070](server/routes.ts#L1070))

`listAllBills` only returns `ACCPAY`, so linked credits currently land in `notInXero` — a false alarm on every sweep. Union in `listAllCreditNotes` with the same status set (`AUTHORISED, PAID, SUBMITTED, VOIDED, DRAFT`), key by `CreditNoteID`, and normalise the record before `diffBillVsXero` so the diff sees a consistent shape:

```ts
const normalised = { ...doc, InvoiceID: doc.InvoiceID ?? doc.CreditNoteID,
                     AmountPaid: doc.AmountPaid ?? (doc.Total - (doc.RemainingCredit ?? doc.Total)) };
```

`isSurprisingXeroChange` needs a look: an allocation made in Xero changes a credit's settled amount without anyone touching Morada. That's *expected*, not surprising — otherwise the nightly sweep spams `notifySurprises` ([xeroReconcileScheduler.ts:21](server/services/xeroReconcileScheduler.ts#L21)).

---

## 6. Correctness fixes outside the Xero boundary

These are pre-existing bugs that credits expose. Ship them with Phase 1.

**6.1 PO status (D5)** — [poStatusFromBills.ts:35](server/services/poStatusFromBills.ts#L35). The `linkedBills` query has no `billType` filter, so a credit linked to a PO adds its `paidAmount` to `sumPaid` and its `paid` status to `allPaid`, pushing the PO toward `paid` in the wrong direction. Decide and implement one of:
- **(a) Exclude credits** — `.where(and(eq(matchedSitePOId, poId), ne(billType, 'credit')))`. Simple, and the PO's "invoiced/paid" state stops being distorted.
- **(b) Net them** — subtract credit totals from the invoiced total. More faithful to a PO that was over-invoiced then credited.

Recommend **(a)** for Phase 1 (it's a strict improvement over today and can't be wrong in a new way), with (b) as a follow-up if Jed wants credited POs to reopen.

**6.1b Due math must subtract `creditedAmount`** (§1.5.1). Every place computing amount owing: `billDueCents` ([Bills.tsx:106](client/src/pages/Bills.tsx#L106)), the summary tiles ([Bills.tsx:934–956](client/src/pages/Bills.tsx#L934)), the BillDetail header Paid/Due readout, and the PO recompute in 6.1. Formula becomes `total − paidAmount − creditedAmount`. Display it as its own figure ("Paid $0 · Credited $800 · Due $4,200"), not merged into Paid.

**6.2 Bills list summary tiles** — [Bills.tsx:934–956](client/src/pages/Bills.tsx#L934). Already negate credits for the amount tiles. Audit the *paid*/*outstanding* tiles specifically: a fully-allocated credit has `paidAmount === total`, which would read as "$X paid out" if any tile sums `paidAmount` without a sign flip.

**6.3 Payments panel** — [BillDetail.tsx:3344](client/src/pages/BillDetail.tsx#L3344). "Record Payment" is meaningless on a credit. Hide the button when `billType === "credit"`; in Phase 3 replace it with "Apply credit". Until Phase 3, credits show a read-only "Remaining credit" figure.

**6.4 Known gap carried over** — `syncBillFromXeroInternal` writes the `paidAmount` scalar but creates no `bill_payments` row (see `morada-xero-paid-bill-sync` Phase 2). For credits this manifests as "Settled $X" with an empty allocations list. Same root cause, same fix; call it out so it isn't diagnosed twice.

---

## 7. Client

**7.1 Type switch is destructive.** Flipping Type on a bill that's already in Xero can't be honoured — Xero cannot convert an invoice into a credit note. Lock the Type select once `xeroInvoiceId` is set, with a tooltip: *"Already synced to Xero as a bill. Void it in Xero and create a new credit."* ([BillDetail.tsx:2102](client/src/pages/BillDetail.tsx#L2102)).

**7.2 Entry point.** Add "New Vendor Credit" as a second item on the New Bill split-button ([Bills.tsx:1385](client/src/pages/Bills.tsx#L1385)) routing to `/bills/new?type=credit`, so credits are discoverable rather than a dropdown deep in the form. Header/title logic already handles it ([BillDetail.tsx:1892](client/src/pages/BillDetail.tsx#L1892)).

**7.3 Xero panel copy.** "Push to Xero" → "Push credit note to Xero"; the success toast, the "View in Xero" deep link (`/AccountsPayable/ViewCreditNote.aspx?creditNoteID=…` vs `ViewBill`), and the sync badge at [BillDetail.tsx:3425](client/src/pages/BillDetail.tsx#L3425) all need the type.

**7.4 New error codes** surfaced from the push, rendered as calm inline messages like the existing `INVOICE_LOCKED` treatment (~[BillDetail.tsx:1145](client/src/pages/BillDetail.tsx#L1145)):

| Code | Meaning | Copy |
|---|---|---|
| `CREDIT_LOCKED` | credit note has allocations in Xero | "This credit has been applied in Xero, so its lines can't be changed. Your edit was saved in Morada." |
| `ALLOCATION_EXCEEDS_CREDIT` | Phase 3 pre-flight | "That's more than the credit has left ($X remaining)." |
| `ALLOCATION_EXCEEDS_BILL` | Phase 3 pre-flight | "That's more than the bill still owes ($X due)." |
| `ALLOCATION_NOT_AUTHORISED` | either doc not AUTHORISED in Xero | "Both the credit and the bill need to be approved before the credit can be applied." |
| `ALLOCATION_CONTACT_MISMATCH` | different suppliers | "A credit can only be applied to bills from the same supplier." |

**7.5 Apply-credit UI (Phase 3).** On a credit's detail page, an "Apply to bills" panel: supplier-filtered list of that supplier's `awaiting_payment` bills with amounts due, an amount input per row defaulting to `min(remaining credit, bill due)`, running "remaining credit" readout, single Apply action. Mirror the Record Payment dialog's shape so it reads as the same product.

---

## 8. Remediating the existing bad data

Before deploying, find credits already pushed as `ACCPAY`:

```sql
SELECT b.id, b.bill_number, b.total, b.xero_invoice_id, b.status, c.name AS supplier
FROM bills b
LEFT JOIN contacts c ON c.id = b.supplier_id
WHERE b.bill_type = 'credit' AND b.xero_invoice_id IS NOT NULL;
```

Each hit is a bogus payable in that customer's Xero file. Remediation is **manual and per-row**, not scripted — voiding documents in a live accounting file must be a human decision:

1. Void the bogus `ACCPAY` invoice in Xero (or delete it if still DRAFT).
2. `UPDATE bills SET xero_invoice_id = NULL, xero_paid_status = NULL, xero_last_sync_at = NULL, xero_last_sync_status = NULL WHERE id = '…';`
3. Re-push from Morada — it now creates a proper `ACCPAYCREDIT`.

If any bogus invoice has already been **paid or reconciled** in Xero, stop and hand it to the bookkeeper — unwinding a reconciled transaction is not a Morada operation.

**Interim guard (ship immediately, ahead of Phase 1):** in `pushBillToXeroInternal`, if `bill.billType === "credit"`, return `{ ok: false, status: 422, error: "CREDIT_NOT_SUPPORTED", message: "Vendor credits can't sync to Xero yet — record it in Xero directly." }` and skip the push. Roughly 8 lines. Stops the bleeding while the real work lands.

---

## 9. Phasing

| Phase | Scope | Migration | Ship as |
|---|---|---|---|
| **0** | Push guard rejecting credits (§8) + the D5 PO fix | none | hotfix, straight to main |
| **1** | `createCreditNote`/`updateCreditNote`/`getCreditNote`/`getXeroDocument`, push dispatch, attachments resource param, sync + webhook fixes, **`creditedAmount` read + due math (§1.5.1)**, client copy + type lock, §6 audit fixes | `0040` (verify) | `feat/xero-credit-notes` |
| **2** | `listCreditNotes`, import preview union + typed import payload, reconcile union, surprise-detection tuning | none | stacked on Phase 1 |
| **3** | **NOT BUILT** — allocation-from-Morada. Retained in §3.7 / §7.5 / §2 as an option. Decided against 2026-08-04 (§1.5). | table half of `0040` | — |

Phases 1 and 2 are independently deployable, and together are the complete feature under the raise-only decision.

**The `creditedAmount` work in Phase 1 is load-bearing, not a nice-to-have.** It's what makes raise-only a coherent product rather than a half-feature: without it, allocating in Xero leaves Morada showing a Paid badge next to a full outstanding balance. Do not descope it to ship Phase 1 faster.

---

## 10. Test plan

**Unit** (`server/__tests__/xero-credit-notes.test.ts`, alongside the existing `xero-bill-dedup.test.ts`):

- `createCreditNote` emits `Type: ACCPAYCREDIT`, `CreditNoteNumber`, **no `DueDate`**, positive `UnitAmount`s, and posts to `/CreditNotes`.
- `pushBillToXeroInternal` dispatches on `billType` — a `credit` row never hits `/Invoices`.
- `getXeroDocument` routes by type.
- Settled math: `Total: 110, RemainingCredit: 40` → `paidAmount === 7000`; `RemainingCredit` absent → `paidAmount === 0`.
- `AmountCredited` lands in `creditedAmount`, never in `paidAmount`; a bill with `Total: 5000, AmountPaid: 0, AmountCredited: 800` reads Paid $0 / Credited $800 / Due $4,200 and does **not** display as paid-in-full.
- Status mapping for credit notes, including `PAID` → local `paid` and `VOIDED` → `draft` + note.
- `recomputePOStatusFromBills` ignores linked credits.
- Phase 3: each of the five allocation pre-flights returns its typed error.

**Manual, against the Xero demo org** (there is no sandbox for allocations that a unit test can cover):

1. Create a vendor credit → approve → confirm an `ACCPAYCREDIT` appears in Xero with matching total, GST, tracking (cost code + project), and attachments.
2. Edit lines before allocation → confirm the update lands.
3. Allocate in Xero → edit in Morada → confirm the calm `CREDIT_LOCKED` message, not raw Xero text.
4. Raise a credit note in Xero → confirm the webhook syncs it and the import preview offers it with a Credit badge.
5. Void in Xero → confirm local flips to draft with the void note.
6. Check budget actuals before/after: the credit subtracts **once** — allocating it must not subtract again.
6b. **The raise-only round trip.** Raise a credit in Morada → push → allocate it against a bill *in Xero* → confirm the bill in Morada updates to Paid $0 / Credited $X / Due (total − X), and does not show a Paid badge until genuinely settled. This is the decisive test for §1.5.
7. Confirm the nightly reconcile reports zero surprises for an allocated credit.

**Regression:** the whole bill push/sync suite must be untouched — every change is additive or behind a `billType === "credit"` branch. `tsc` count must not exceed the ~1432 baseline (delete `.tsbuildinfo` first).

---

## 11. Traps

- **`getInvoice` on a `CreditNoteID` returns 404, silently.** Most call sites treat a falsy result as "nothing to do" and `continue` — which is exactly why D4 has been dead code without anyone noticing. Any new fetch path must go through `getXeroDocument`.
- **Don't negate anything.** Positive local storage → positive Xero credit note. The only place a sign appears is at display and in budget actuals, both already correct. A negation added "for consistency" in the push path silently doubles the error.
- **Don't double-count allocation.** The credit reduces project actuals the moment it exists. Allocation is a *settlement* event and must have zero budget effect.
- **`billType !== "bill"` is the wrong guard** — it catches `receipt` too, which genuinely is a payable. Always test `=== "credit"`.
- **Guard, then push.** Phase 0's guard must land before any Phase 1 code touches prod; a partial deploy where the dispatch exists but `createCreditNote` doesn't is worse than today.
- **`isSurprisingXeroChange`** will fire on every Xero-side allocation unless tuned — nightly notification spam is how people learn to ignore the sweep.
