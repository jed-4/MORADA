---
name: Attachment preview needs mimeType
description: Bill/object-storage attachment URLs are extensionless, so preview kind-detection must use the stored mimeType, not the URL.
---

Bill attachments uploaded to object storage (and Xero-imported ones) live at
extensionless paths like `/objects/company/<companyId>/uploads/<uuid>`.

`DocumentPreview.detectKind()` decides image vs pdf vs "other" from `mimeType`
first, then falls back to the URL extension. With no extension, the fallback
yields "other" → a generic download card instead of the real PDF/image render.

**Rule:** whenever you open an attachment in any preview (modal, side panel,
thumbnail), carry the `mimeType` from the rich attachment record
(`{ objectPath, filename, mimeType }`) all the way through. Never rely on the
URL extension for object-storage attachments.

**Why:** the most common real case (Xero-imported bills) is extensionless;
dropping mimeType silently breaks exactly that case.

**How to apply:** the rich attachment record shape is
`string | { objectPath?, filename?, mimeType? }`. When normalizing
`bill.attachmentUrls`, keep `mimeType` and pass it into the preview component.

**Related:** `DocumentPreview` ignores `className` for the PDF branch (uses the
`height` prop) but uses it for image/"other". Passing `w-full h-full` to it
overrides the image branch's default `object-contain` and distorts images —
prefer passing `height` only and letting its defaults handle fit.
