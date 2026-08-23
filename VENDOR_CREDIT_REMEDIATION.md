# Vendor credits pushed to Xero as ACCPAY — remediation

**Status:** written, **not run**. Nothing in this document should be executed by a script.
**Companion to:** the Phase 0 guard in this PR (`server/services/xeroCreditGuard.ts`) and
`CREDIT_NOTES_PLAN.md` §8 on `feat/vendor-credits`.

---

## What went wrong

`createBill` / `updateBill` hardcode `Type: "ACCPAY"` ([xeroService.ts:839](server/services/xeroService.ts#L839),
[:906](server/services/xeroService.ts#L906)) and the push payload never carried `billType`. A bill with
`bill_type = 'credit'` therefore synced to Xero as a **normal supplier bill with positive amounts** —
it *increased* payables in the customer's file instead of reducing them.

The guard in this PR stops new occurrences. It does not touch anything already in Xero. Every row the
query below returns is a **bogus payable sitting in a live accounting file** and has to be dealt with
by hand.

## 1. Find the affected rows

Run against production, read-only:

```sql
SELECT
  co.name        AS company,
  b.id           AS bill_id,
  b.bill_number,
  b.bill_reference,
  b.total / 100.0 AS total_aud,
  b.status,
  b.paid_amount / 100.0 AS paid_amount_aud,
  b.xero_invoice_id,
  b.xero_paid_status,
  b.xero_last_sync_at,
  COALESCE(NULLIF(c.company, ''), c.name) AS supplier
FROM bills b
LEFT JOIN contacts  c  ON c.id = b.supplier_id
LEFT JOIN companies co ON co.id = b.company_id
WHERE b.bill_type = 'credit'
  AND b.xero_invoice_id IS NOT NULL
ORDER BY co.name, b.xero_last_sync_at DESC NULLS LAST;
```

Zero rows means nothing was ever pushed and there is nothing to remediate — the guard alone is the
whole fix.

**Triage each row before touching Xero.** `b.status = 'paid'`, `b.paid_amount > 0`, or a
`b.xero_paid_status` indicating payment are all signals that money has moved; so is any Xero-side
reconciliation, which Morada cannot see. Check the invoice in Xero itself, not just these columns.

## 2. Per row, in order

Manual and per-row. Voiding documents in a live accounting file is a human decision, and each of
these is one supplier's payables ledger.

1. **In Xero**, open the invoice by `xero_invoice_id`
   (`https://go.xero.com/AccountsPayable/View.aspx?invoiceID=<xero_invoice_id>`). Confirm it is the
   bogus one: it should match the credit's total and supplier, and should be `DRAFT`, `SUBMITTED`, or
   `AUTHORISED` with nothing paid or allocated against it.
   - `DRAFT` → delete it.
   - `SUBMITTED` / `AUTHORISED` with no payments, no allocations, not reconciled → void it.
2. **In Morada**, clear the stale Xero link so the row is no longer claimed by a deleted/voided
   document, one row at a time with an explicit id:

   ```sql
   UPDATE bills
   SET xero_invoice_id = NULL,
       xero_paid_status = NULL,
       xero_last_sync_at = NULL,
       xero_last_sync_status = NULL,
       xero_last_sync_error = NULL,
       send_to_xero = FALSE
   WHERE id = '<bill_id>' AND bill_type = 'credit';
   ```

   `send_to_xero = FALSE` is deliberate: with the Phase 0 guard in place a credit cannot push, and
   leaving the flag on makes the auto-push queue retry a document that will 422 every time.
3. **Re-raise the credit in Xero by hand** (Bills → New Credit Note) so the supplier's ledger is
   correct today. Morada's own figures — budget actuals, outstanding due — are already right: they
   read `bill_type` and subtract the credit locally, independent of Xero.
4. When Phase 1 ships (`ACCPAYCREDIT` via `/CreditNotes`), the cleared rows can be re-pushed from
   Morada and will create a proper credit note. Do **not** wait for Phase 1 to unwind the bogus
   payables — they are wrong in the customer's file now.

## 3. Anything paid or reconciled goes to a bookkeeper

If a bogus invoice has been **paid**, has a **payment or credit allocated**, or has been
**reconciled against a bank statement line** in Xero, stop. Do not void it, do not clear the row,
do not script anything.

Unwinding a reconciled or paid transaction changes the customer's bank reconciliation and can move
figures inside a lodged BAS period. That is an accounting decision with a paper trail, not a Morada
operation — hand the list to the customer's bookkeeper and let them decide the correcting entry.
Morada's job stops at reporting which documents are affected.

## 4. Do not automate this

No migration, no backfill script, no batch `UPDATE`. Three reasons:

- The Xero side cannot be undone by SQL. Clearing `xero_invoice_id` in Morada without voiding the
  Xero invoice leaves the bogus payable stranded and now invisible — strictly worse than today.
- Whether a document is safe to void is a judgement call that depends on state Morada does not
  hold (reconciliation, BAS periods, what the bookkeeper has already actioned).
- The population is expected to be small. If it turns out to be large, that is a reason to talk to
  the affected customers, not a reason to write the script.
