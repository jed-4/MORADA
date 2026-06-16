---
name: Auto AI bill reader must be gated
description: The on-open auto-OCR in BillDetail clobbers Xero-imported bills unless gated to empty draft bills.
---

When a bill is opened in edit mode, BillDetail can auto-fire the AI Bill Reader
("ocr-from-attachment") to populate fields. This is meant ONLY for
email-imported **draft** bills that arrived without extraction.

**Pitfall:** Xero-imported bills are created with `ocrProcessed = false`, so a
guard that only checks `!ocrProcessed` will also auto-fire for paid/awaiting
Xero bills. The AI re-extracts a (often wrong) total and `setLineItems(...)`
overwrites the correct imported line items in the local form → Total < Paid →
a bogus negative "Due". The list still shows the correct total because the
clobber is client-only.

**Why no DB corruption:** the server `ocr-from-attachment` route is read-only
(returns extracted data, never writes line items), and the client only PATCHes
status for `status === "draft"` bills. So paid bills are only visually
clobbered, not persisted.

**How to apply:** gate the auto-OCR effect on `bill.status === "draft"` AND no
existing line items (`existingLineItems.length === 0`, after its query loads).
Never auto-run on a bill that already has line items.
