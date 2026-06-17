---
name: Client invoice number global uniqueness
description: client_invoices.invoice_number is globally unique; auto-numbering must check globally and creates must self-heal on collision.
---

# Client invoice number generation

`client_invoices.invoice_number` carries a **global** unique constraint
(`client_invoices_invoice_number_unique`) — unique across ALL projects and ALL
companies, not per-project. The user-facing format is `<jobNum>-CI-NN` where
`jobNum` is the project's construction/preConstruction/lead/job number.

**Rule:** Any next-number generation must look at every invoice sharing the
prefix *globally* (not just `getClientInvoices(projectId)`), derive the next
sequence from the HIGHEST existing number (never a count — deletions create
gaps that count+1 reuses), pad to 2 digits, and skip already-taken numbers.

**Why:** Two projects can share a job number, so a per-project check can hand
back a number another project already owns → insert fails the global unique
constraint → 500 (or a 409 retry loop if the client just refetches the same
bad candidate). This was the root cause of the prod "can't create invoice" bug.

**How to apply:**
- Use `storage.getClientInvoiceNumbersByPrefix(prefix)` (global LIKE query) for
  generation, not the per-project list.
- POST `/api/client-invoices` self-heals: on an `invoice_number` unique conflict
  where the submitted number is auto-generated (`startsWith("<jobNum>-CI-")`),
  regenerate a globally-free number and retry (bounded, max ~6 attempts).
  Manual-number conflicts (or non-invoice_number conflicts) bubble to a clear 409.
- Frontend caches the next-number query with `staleTime: Infinity`, so the
  create mutation MUST invalidate `["/api/client-invoices/next-number"]` on BOTH
  onSuccess and onError or the form reuses the last number.
- Detect the conflict by constraint name (`error.constraint` /
  message includes `client_invoices_invoice_number_unique`), NOT a generic
  "duplicate key" match, so unrelated unique violations aren't misclassified.
