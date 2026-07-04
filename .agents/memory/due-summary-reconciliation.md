---
name: Due/outstanding column ↔ summary reconciliation
description: Per-row "Due"/outstanding amounts and the page's summary/footer total must share one formula or they silently diverge.
---

Any list page that shows a per-row "Due" / "outstanding" amount AND a summary/footer
total of that same concept must compute both from a single shared helper.

**Why:** In Bills.tsx the Due column showed `total − paidAmount` for `awaiting_payment`
bills, but the footer "Awaiting Payment" line kept summing the full `bill.total`. When
a bill is partially paid the two figures diverge, which reads as "the numbers don't add
up." Same class of rule for ClientInvoices (draft rows show "—" / count as 0, so the
"Outstanding" summary must also exclude drafts).

**How to apply:**
- Bills: `billDueCents(bill)` = 0 unless `status === "awaiting_payment"`, else
  `total − paidAmount`, negating credit notes (`billType === "credit"`) to match the
  Amount column. Use it in the Due column accessor, cell, AND the footer statusTotals
  `awaiting_payment` branch.
- Client invoices: an invoice is "issued" (a real receivable with an amount due) only
  when status ∈ {sent, partial, overdue} — `isIssuedInvoice()`. Draft = not owed (0),
  paid = zero balance. Use the same predicate for the row Due sort accessor and the
  `balanceTotal` ("Outstanding") summary.
- Statuses are stored enums: bill_status = draft/needs_review/awaiting_approval/
  awaiting_payment/paid; client invoice status = draft/sent/partial/paid/overdue
  (overdue IS a stored value, not only a derived due-date flag).
