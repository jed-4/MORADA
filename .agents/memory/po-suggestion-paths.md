---
name: PO auto-suggestion trigger paths
description: Every bill-creation/edit path that sets supplier/total must trigger PO suggestion, not just the email-import path.
---

# PO auto-suggestion must fire on every bill mutation that sets supplier/total

`applyPOSuggestionsToBill(bill, { autoApply: true })` (server/services/poSuggestions.ts) finds matching site POs for a bill and either auto-links the high-confidence one (`matchedSitePOId`) or persists ranked `suggestedSitePOIds` chips. It is a no-op if the bill is already linked, and expects `bill.total` in CENTS (matches `purchase_orders.total`).

**Rule:** it must be invoked from EVERY path that creates a bill or sets its supplier/total, not just one:
- `POST /api/bills` — manual uploads land here after AI OCR extraction (the client creates the bill with extracted supplier/total/date), so this is what gives uploaded bills the same auto-suggestion as email import.
- `PATCH /api/bills/:id` — gate on supplier/total actually changing AND `!matchedSitePOId` AND not a manual (un)link, e.g. confirming AI-extracted details on a bill that started empty.
- `autoBillCreator` (email/Gmail import) — already calls `suggestPOsForBill` inline.
- Manual triggers `POST /api/bills/:id/resuggest-po` and admin `POST /api/bills/backfill-po-suggestions`.

**Why:** wiring it only into the email path (or only manual triggers) means uploaded/edited bills silently get no suggestions — the exact gap a review caught. Same class of bug as budget-recalc-paths.md (an invariant that must hold across ALL mutation paths, easy to satisfy in one and forget the others).

**How to apply:** make it best-effort (try/catch — never block bill create/update) and re-fetch the bill after applying so the HTTP response reflects any auto-link. Don't import `suggestPOsForBill` into routes.ts unless used directly — `applyPOSuggestionsToBill` calls it internally.
