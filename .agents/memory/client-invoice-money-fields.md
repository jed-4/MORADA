---
name: ClientInvoice money fields
description: ClientInvoice rows carry no totalIncTax; money is totalAmount/paidAmount/balanceAmount (cents)
---

ClientInvoice rows (fetched via `/api/client-invoices?projectId=` → storage.getClientInvoices,
which returns RAW table rows) have **no `totalIncTax` field**. The real money columns are
`totalAmount`, `paidAmount`, `balanceAmount` — all integer **cents** — plus `status` and `dueDate`.

**Why:** `useProjectMetrics` historically summed `inv.totalIncTax`, which is `undefined`, so every
invoice-derived dollar metric (invoicedAmount, paidInvoices, remainingToInvoice, and the WIP /
gross-margin / Budget-vs-Actual figures that consume them) silently evaluated to $0. It compiled
because Widget configs / loosely-typed access never flagged the missing field.

**How to apply:** Any invoice-amount rollup must read `totalAmount`/`paidAmount`/`balanceAmount`
and divide by 100 for dollars. Status buckets reconcile as
`draft + (sent|overdue) + partial + paid = non-cancelled total` using `totalAmount`. Treat an
invoice as overdue only when it is issued (status not `draft`, not `paid`) AND `dueDate < now` —
drafts are never overdue.
