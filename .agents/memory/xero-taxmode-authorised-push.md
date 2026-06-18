---
name: Xero tax-mode toggle vs authorised bills
description: Why flipping inclusive/exclusive on a Xero-linked awaiting_payment bill shows a "disconnected" (red) Xero icon.
---

Editing a Xero-linked bill via PATCH `/api/bills/:id` auto-pushes back to Xero
(`scheduleAutoPushBill`) for any non-paid linked bill. Paid bills are skipped
(`bill.status === "paid"` guard), so they never re-push.

Changing the inclusive/exclusive **toggle** (`bills.tax_mode`) therefore re-pushes
the bill to Xero with a different `LineAmountTypes` (Inclusive vs Exclusive).
Xero will NOT change `LineAmountTypes` on an already-**AUTHORISED** invoice
(BuildPro "awaiting_payment" → Xero AUTHORISED). Xero rejects it with its generic
catch-all ("An error occurred in Xero. Check the API Status page...") — NOT a
parseable 400 ValidationError — so the real reason is opaque.

That failure is stored as `xero_last_sync_status='failed'`, and the Bills list
(`client/src/pages/Bills.tsx` xero column) then renders a red `AlertCircle`
instead of the blue Xero glyph. **This looks like a lost connection but isn't** —
`xero_invoice_id` is still set; only the last push failed. Xero's copy is
unchanged (the rejected update made no change there).

**Why it presents as "paid = fine, awaiting payment = broken":** paid bills don't
auto-push at all; awaiting_payment bills do and get rejected for the tax-basis
change.

**Recovery:** "Sync from Xero" (`syncBillFromXeroInternal`) re-pulls amounts and
sets sync status back to success (blue icon). Note it only re-stamps `tax_mode`
for **draft** bills, so a non-draft bill keeps its (now-mismatched) local
tax_mode while its subtotal/tax/total are overwritten with Xero's values.

**How to apply:** Import maps tax mode straight from Xero
(`LineAmountTypes === "Inclusive" ? inclusive : exclusive`), so an imported bill's
toggle already matches Xero. If a user wants a different tax basis they must fix
it in Xero (void + reissue) — BuildPro can't flip LineAmountTypes on an
authorised invoice. Any fix should avoid flagging such bills as failed/"lost
connection" for an edit Xero structurally won't accept.
