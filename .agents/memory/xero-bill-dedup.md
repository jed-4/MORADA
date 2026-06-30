---
name: Xero duplicate-bill cleanup
description: How duplicate Xero bills are collapsed (keep oldest) and what dependent data must be moved first.
---

# Xero duplicate-bill cleanup

A race in the Xero bill import (check-then-insert, no DB-level uniqueness) created
multiple local bills for the same Xero invoice. The cleanup collapses every
`(company_id, xero_invoice_id)` group down to the **oldest** bill by `created_at`
(the keeper); the rest are deleted.

**Rule:** before deleting a copy, move everything that would otherwise be lost onto
the keeper, then delete. Order matters — reparent first, delete last, all inside a
per-group transaction.

**What must be moved per copy (and where it lives):**
- `bill_payments` → repoint `bill_id` to keeper.
- `attachment_urls` (JSON array on the bill row) → merge into keeper's array,
  de-duplicated by `objectPath` (fallback: JSON string of the entry).
- `invoice_bills` and `variation_bills` → repoint to keeper, **dropping** any link
  that would collide with one the keeper already has (composite uniqueness).
- `purchase_orders.matched_bill_id` → repoint to keeper. This column (schema ~5189,
  no FK) is the ONLY `matched_bill_id` in the DB; it's what the task calls
  "inbox/email matches".

**Never reparent `bill_line_items`.** Each duplicate already imported its own full
set of line items; reparenting would double budget actuals. Copy line items are
deleted by cascade along with the copy.

**Why oldest, not newest:** the oldest row is the one other records were most likely
linked to first; keeping it minimises the relinking surface.

**After deletion:** recompute budget actuals for every affected project (collect
`projectId` of deleted copies + keeper) via the existing `recalcProjectBudget`
helper — otherwise spend figures stay inflated by the removed duplicates.

**Idempotent + dry-run:** the service finds groups via groupBy/having; a second run
finds no groups and is a no-op. Dry-run computes the same report (counts of
payments/attachments/links/PO-matches to move) without writing. A JSON backup of
deleted rows + pre-merge keeper attachment arrays is logged before any mutation.

**Auth:** the endpoint is gated by `requirePlatformStaff` (cross-tenant, NOT bypassed
in dev) because the operation is database-wide; `requireAdmin` is tenant-scoped and
would be wrong here. Default to dry-run; only destructive when `dryRun === false`.

**Out of scope:** preventing future dups + the unique index (separate task) and
bills with null `xero_invoice_id` (manual bills — never touched). The dedup must run
BEFORE the unique index is added, or the index creation fails on existing dups.
