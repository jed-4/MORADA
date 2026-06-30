---
name: react-pdf worker must be called, not just imported
description: Every react-pdf <Document> surface must invoke ensurePdfWorker(); importing it is not enough or PDFs fail intermittently in prod.
---

Every component that renders a react-pdf `<Document>` must actually CALL
`ensurePdfWorker()` (from `client/src/lib/pdfWorker.ts`) in its render body, not
merely import it.

**Why:** `ensurePdfWorker` sets `pdfjs.GlobalWorkerOptions.workerSrc` once via a
module-level singleton. If a PDF surface never calls it, pdf.js falls back to a
"fake worker" that fails in the production bundle, surfacing as the generic
"Failed to load PDF". It is intermittent and dev-masked: it only fails when that
surface is the FIRST PDF view visited in a session (before any other surface set
the singleton); after another surface ran, the global is set and it "works".
This is exactly what bit the take-off plan viewer.

**How to apply:** When adding/auditing any `<Document>` usage, confirm
`ensurePdfWorker()` is invoked (the working surfaces — PdfInlineViewer,
DocumentPreview, proposals/PDFPreview, ui/DocumentPreviewModal — all call it).
The call is async/fire-and-forget at the top of the component body, which is
acceptable in practice (react-pdf starts loading after a render+effect, by which
time the bundled worker import has resolved). For transient load failures, a
retry that bumps a key on `<Document key=...>` remounts and re-fetches.
