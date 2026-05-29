---
name: Xero bill import — tracking→cost code + attachment download
description: How BuildPro maps Xero tracking categories to cost codes and pulls invoice attachments on import.
---

# Xero bill import: cost-code mapping and attachment download

**Tracking category → cost code:** Xero connection has `trackingCategory1Id` (TC1 = cost codes) and `trackingCategory2Id` (TC2 = projects). Cost codes (shared/schema.ts) carry `xeroTrackingOptionId` / `xeroTrackingOptionName` / `xeroTrackingCategoryId`. On import, build a map `xeroTrackingOptionId → costCode.id` (and a name-based fallback map). Per Xero line item, scan `xl.Tracking[]`, prefer the entry whose `TrackingCategoryID === trackingCategory1Id` and match by `TrackingOptionID` (GUIDs — collision-free). Set `lineType: "cost_code"` when resolved, else fall back to import-wide `defaultCostCodeId`, else `"custom"`.
**Why the GUID path is safe regardless of TC1:** option IDs are globally unique, so the name fallback (its only collision risk) only matters when TC1 is unknown.

**Attachment download:** there was no download method — added `xeroService.downloadInvoiceAttachment(connectionId, xeroInvoiceId, att)`: GET `/Invoices/{id}/Attachments/{AttachmentID | encoded FileName}` with `Accept: <MimeType>`, returns a Buffer. List via existing `getInvoiceAttachments`. Persist by uploading the buffer with `new ObjectStorageService().uploadObjectEntity(buffer, contentType, companyId)` (returns `/objects/company/<id>/...`), then `storage.appendBillAttachment(billId, {objectPath, filename, mimeType, uploadedAt, uploadedBy, source:"xero"})`. `BillAttachment.source` enum allows `"xero"`. Do it best-effort per file so one failure doesn't abort the import.
