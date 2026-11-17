# Site QR codes — plan

Worktree `morada-site-qr`, branch `feat/site-qr-codes`, cut from origin/main @ 6b1b0327 (2026-11-16).

## Decisions (Jed, 2026-11-16)

- **One QR per job → a site hub page** with tabs: Selections + Plans/Files.
- **No schedule** on the hub.
- **Plans are not take-offs.** Files are uploaded into Morada into a project folder (e.g. "Plans"); we pick which files the QR shows.
- **Anyone who scans can see it** (no login). Replace-code still kills old printed codes.
- **Printed codes use `https://app.moradaco.com.au`** (live; already the fallback used by variation/proposal emails).
- **Better print sheet** needed.
- Later idea, not this work: a trades login / trade version of the app.

## What exists today

| Piece | Where |
|---|---|
| Site QR for selections (#257) | `SiteQrDialog.tsx`; Selections ⋯ → "Site QR code & link" |
| Token | `projects.tradesPortalToken` (schema.ts:1077), lazy + regenerable |
| Token/QR endpoints | `GET /api/projects/:id/trades-portal-token`, `POST …/regenerate`, `GET …/trades-qr` (routes.ts ~18181–18233) |
| Public data + attachment bytes | `GET /api/portal/project/:token/trades`, `…/trades/attachments/:id` (routes.ts ~21142–21235) |
| Public page | `/portal/project/:token/trades` → `TradesPortal.tsx` (register new portal routes in BOTH lists in App.tsx: 162–168 and 401–422) |
| Any `/api/portal/*` route | auto-exempt from auth (routes.ts ~2287) — must check its own token |

**There is no Morada-native project file store.** The project Files page (`ProjectFiles.tsx`) is Google Drive only. `docs`/`doc_folders` (Library) and `system_folders`/`system_documents` are company-level, not per project. Object storage upload/serve already works (`/objects/company/:cid/*`, local fallback in dev).

## Build

### PR 1 — Project files in Morada + site hub
- Migration: `project_files` (id, companyId, projectId, folder text default 'Plans', name, objectPath, mimeType, fileSize, onSite boolean default false, sortOrder, uploadedBy, timestamps). Folders as a simple text column to start; a folder table only if we need nesting.
- Staff API (requireTeamMember + enforceProjectCompany): list / upload / rename / move folder / toggle onSite / delete.
- UI: a "Site files" panel on the project (folder list, upload, drag to reorder, "Show on site QR" toggle per file).
- Public API: `GET /api/portal/project/:token/files` (onSite only, no uploader names) + `GET …/files/:fileId` streaming, checks file belongs to the token's project AND `onSite = true`.
- Hub: `TradesPortal.tsx` gets tabs **Selections | Plans** (hide a tab when it is empty). PDFs open inline on phones.

### PR 2 — QR + print sheet
- `publicBaseUrl()` helper: `APP_BASE_URL` → `https://app.moradaco.com.au`, never the request host for printed codes. Shared `qrPng()`; de-dupe the 3 copies.
- Move "Site QR" to the project page (keep the Selections menu entry pointing at it). Wording: "Scan for selections & plans".
- A4 print sheet in the PDF kit: company logo, project name + address, big QR, short instructions, URL fallback.

## Open questions
- Where the "Site files" panel lives: its own project tab, or a section on the project overview.
- Should Drive files be pickable too (proxy through the connected Drive)? Default: no, upload into Morada.
