# RFQ Section — Code Audit

> **Status: every finding below is now closed on this branch**, across five
> changes: PR 1 (core loop), PR 2 (recipients + per-line quote schema, and the
> detail-page rebuild), PR 3 (registry), PR 4 (real sending + reminder
> scheduler), and PR 5 (the remaining Tier 1/2 items).
>
> Two were closed by removal rather than construction, deliberately:
> - **2.5, the `/rfqs/:id/confirm` link.** Not built. One PDF goes to every
>   supplier, so a confirm link in it can never say *who* confirmed. Each
>   recipient now gets their own tokenised portal link in the email body, which
>   is the only place it can be correct. `confirmed` is consequently an unused
>   value in `rfq_status` — recipient status carries this now.
> - **1.5, per-line quote comparison.** The schema (`rfq_quote_items`) and its
>   API landed in PR 2, but no UI consumes it yet — comparison is still
>   total-vs-total. Parked by agreement.
>
> The findings are kept as originally written for the record.

**Date:** 2026-08-02
**Branch:** `feat/rfq` (off `origin/main` @ 7736dcef)
**Scope:** `client/src/pages/RFQ*.tsx`, `client/src/pages/Rfq*.tsx`, `client/src/pages/CreateRFQ.tsx`,
`client/src/components/rfq/**`, RFQ routes in `server/routes.ts`, RFQ tables in `shared/schema.ts`.

`docs/user-stories/14-rfqs.md` claims **25 of 25 stories implemented**. That is not accurate.
The UI shell is largely built; a significant share of the wiring behind it is missing or broken.

---

## Tier 0 — Broken: the core loop does not work

### 0.1 Line items never load on the RFQ detail page
`client/src/pages/RFQDetail.tsx:127`
```ts
useQuery<RfqItem[]>({ queryKey: ["/api/rfq-items", id] })
```
The shared fetcher builds the URL with `queryKey.join("/")` (`shared/api.ts:78`), producing
`GET /api/rfq-items/<rfqId>`. **No such route exists.** The only items route is
`GET /api/rfqs/:rfqId/items` (`server/routes.ts:15476`).

Consequence: the query always errors, `items` falls back to `[]`, and RFQ detail permanently shows
"No line items yet" — even for RFQs with items in the database. Every downstream feature that keys
off `items` is dead too (PDF generation is gated on `items.length`, so PDF preview/download never
runs either).

The `queryClient.invalidateQueries` calls after add/import/delete also target this dead key.

### 0.2 Line items typed on the Create RFQ page are silently discarded
`client/src/pages/CreateRFQ.tsx:169` posts `items: [...]` to `POST /api/rfqs`. The route validates
with `insertRfqSchema` (`server/routes.ts:15389`), which has no `items` key, so Zod strips it. The
RFQ is created; the items the user typed are thrown away with no error. Combined with 0.1, items
entered at creation are invisible and unrecoverable via the UI.

### 0.3 "Send RFQ" does not send anything, and does not change status
`client/src/components/rfq/SendRFQDialog.tsx:97`
```ts
// TODO: Implement actual email sending and notification creation
```
No email is sent, no in-app notification is created, no portal token is generated, the PDF is never
uploaded. The user still gets a success toast reading `RFQ sent to N suppliers`.

Worse, the status update is also dropped. The dialog PATCHes:
```ts
apiRequest(`/api/rfqs/${rfq.id}`, "PATCH", { status: "sent", sentAt: now.toISOString() })
```
but `PATCH /api/rfqs/:id` validates with `insertRfqSchema.partial()`, and `insertRfqSchema`
**omits** both `status` and `sentAt` (`shared/schema.ts:5017-5028`). Zod strips them, so
`storage.updateRFQ` receives `{}`. **Every RFQ stays `draft` forever.** There is no other code path
that sets a status, so `sent`/`confirmed`/`quoted`/`accepted`/`declined`/`expired` are unreachable
in production.

### 0.4 Accept / decline quote returns 400
`client/src/components/rfq/QuoteComparisonView.tsx:24,48` send
`acceptedAt`/`declinedAt` as ISO **strings**. `PATCH /api/rfq-quotes/:id`
(`server/routes.ts:15619`) validates with `insertRfqQuoteSchema.partial()`, where drizzle-zod maps
those timestamp columns to `z.date()`. A string fails validation → 400 "Validation failed".

Accepting a quote also never updates the parent RFQ (US-RQ017 claims it does), and declining never
rolls the RFQ to `declined` (US-RQ018).

### 0.5 The supplier portal is unreachable
The portal itself is the most complete part of the feature — `RFQPortal.tsx`,
`GET /api/portal/rfq/:token` and `POST /api/portal/rfq/:token/submit-quote` all work. But
**nothing in the app ever creates a portal token.** `POST /api/rfq-portal-tokens` exists and has
zero callers in `client/`, `mobile/`, or `server/services/`. There is no UI to copy or send a portal
link. A supplier can only reach the portal if someone hand-inserts a row.

---

## Tier 1 — Advertised but not implemented

### 1.1 Editing line items (US-RQ007)
`RFQDetail.tsx:86` declares `const [editingItem, setEditingItem] = useState<RfqItem | null>(null)`
and never uses it. There is no edit dialog and no inline edit. The only item action is delete.
`PATCH /api/rfq-items/:id` exists server-side with no client caller.

### 1.2 File attachments (US-RQ025)
`RFQDetail.tsx:831` — the Upload button's entire handler is `onClick={(e) => e.stopPropagation()}`.
The per-file Download button (`:855`) has no handler at all. There is no drag-and-drop despite the
placeholder text "Drag files here or click Upload". `attachmentUrls` / `attachmentFileNames` can
never be populated from the UI.

### 1.3 Quote file attachments are fake
`UploadQuoteDialog.tsx:51-61` — files are never uploaded; the code synthesises
`url: /uploads/quotes/<filename>`, a path that does not exist. Those URLs are then persisted and
rendered as real attachments in the RFQs list preview modal (`RFQs.tsx:832-845`), which will show a
broken image / blank iframe. The dialog also omits `leadTime` and `validUntil`, which the schema and
the portal both support.

### 1.4 Follow-up reminders are never sent (US-RQ019)
`SendRFQDialog.tsx:81-95` writes four `rfq_follow_ups` rows (day 0/3/7/14). Nothing ever reads them:
`getRFQFollowUps` is only called from the routes file. **There is no scheduler or background job.**
The RFQ detail sidebar also exposes a separate `followUpEnabled` / `followUpDaysBefore` config that
is unrelated to the four hardcoded rows and equally inert.

### 1.5 Per-item quote pricing does not exist (US-RQ016)
The story promises "line-by-line pricing comparison across all quoting suppliers". `rfq_quotes` has
only `totalAmount` — there is no quote-line table. Comparison is total-vs-total only. Either the
story or the schema needs to change; this is a design decision, not a bug fix.

### 1.6 Import from estimate reads fields that don't exist (US-RQ006)
`RFQDetail.tsx:230-235` reads `ei.costCodeId`, `ei.itemDescription`, `ei.unit`, `ei.unitPrice`.
The real `estimate_items` columns are `costCode` (text) / `costCategoryId`, `name`, `unitType`, and
`unitCostExTax` (`shared/schema.ts`). So every import produces: no cost code, unit forced to
`"each"`, no price, and a description taken from `ei.description` — a secondary notes field that is
usually empty, while the actual label lives in `ei.name`. The preview table (`:1200`) shows `-`
in every Unit Price cell for the same reason.

Also a units/money hazard: `estimate_items.unitCostExTax` is **dollars** (doublePrecision);
`rfq_items.unitPrice` is **cents**. Any fix must convert, per `shared/money.ts`.

---

## Tier 2 — Correctness and consistency

### 2.1 Three competing status vocabularies
| Source | Values |
|---|---|
| `rfqStatusEnum` (`shared/schema.ts:4965`) | draft, sent, confirmed, quoted, accepted, declined, expired |
| `RFQs.tsx:90` filter chips | draft, sent, **pending**, quoted, accepted, declined |
| `useRfqStatusOptions.ts:17` defaults | draft, sent, **received, awarded, closed, cancelled** |

The list page filters on `pending`, which is not a valid RFQ status, and offers no filter for
`confirmed` or `expired`. `STATUS_LABEL` has no entry for those two either, so a `confirmed` or
`expired` RFQ renders a badge with an undefined label. `useRfqStatusOptions.ts` has **zero
importers** — it is dead code proposing a third vocabulary.

### 2.2 RFQ numbering is wrong and collides
`server/routes.ts:15399-15403`
```ts
const rfqNumber = `${project?.name.substring(0, 4).toUpperCase() || 'PROJ'}-RFQ-${...}`;
```
- Ignores `companySettings.rfqPrefix` and `rfqStartNumber` (`shared/schema.ts:1309,1319`), which
  exist precisely for this and which US-RQ003 says are used.
- Derived from `existingRFQs.length + 1`, so deleting any RFQ makes the next one reuse a number.
  There is no unique constraint on `rfq_number` to catch it.
- Not concurrency-safe.

### 2.3 `POST /api/rfqs` does not verify project ownership
`server/routes.ts:15400` fetches the project but never checks `project.companyId` against
`req.user.companyId`, so an RFQ can be created against another company's project. The RFQ is stamped
with the caller's `companyId`, which makes the mismatch hard to spot later.

### 2.4 Portal gaps
- `GET /api/portal/rfq/:token` (`:16253`) never checks `portalToken.isActive` — revoking a token
  by deactivating it has no effect.
- The portal response omits `customTerms`, contradicting US-RQ010 ("terms displayed on the supplier
  portal").
- `POST .../submit-quote` does not move the RFQ to `quoted` (US-RQ015).
- Quote amount is submitted as a bare number with no inc/ex-GST label anywhere in the form. Given
  Morada's inc-GST default, this needs an explicit label. `QuoteComparisonView.tsx:79-81` then
  assumes the stored total is **ex** GST and adds 10% when converting to a PO — a silent 10% error
  if the supplier typed an inc-GST figure.

### 2.5 Dead UI controls
- `RFQs.tsx:512-521` — the row action menu's "Download PDF" and "Send RFQ" items have handlers that
  only call `e.stopPropagation()`. They look live and do nothing.
- `RFQs.tsx:687` — the options menu contains a single disabled "No options" item.
- `RFQDetail.tsx:287` — the generated PDF embeds a confirm link to `/rfqs/:id/confirm`. **That route
  does not exist in `App.tsx`.** Every supplier who clicks it lands on the not-found page. This is
  also the only thing that could ever produce the `confirmed` status.
- `RFQs.tsx:219-224` — a permanently-greyed "Seen" column for email tracking that doesn't exist.

### 2.6 Smaller items
- `RFQDetail.tsx:367` — `goBack()` is hardcoded to `/rfqs`, dropping project context. Same at
  `CreateRFQ.tsx:172` (cancel/back).
- `RFQDetail.tsx:320` — Download PDF only works after the user has opened Preview, because `pdfBlob`
  is only populated while `showPreview` is true. The button is otherwise disabled with no
  explanation. Same root cause blocks `SendRFQDialog`, which refuses to send without a `pdfBlob`.
- `RFQDetail.tsx:259` — PDF generation is gated on `items.length`, so an RFQ with a scope but no
  line items can never produce a PDF at all.
- `GlobalSearch.tsx:101` points RFQs at `/business/rfqs`, which is not a registered route.
- `RFQDetail.tsx:741` — the items total is labelled "Total (ex GST)" but nothing establishes that
  `rfq_items.unitPrice` is ex GST; the field is undocumented and unlabelled everywhere it is entered.
- `RFQDetail.tsx:778` — `onClick` passed to a Radix `<Select>` (not a DOM prop); the intended
  `stopPropagation` never runs, so opening the terms template dropdown also toggles the section.

---

## Suggested sequencing

**Phase 1 — make the loop work** (0.1, 0.2, 0.3-status, 0.4, 2.2, 2.3)
Fix the items query key, accept `items` on create, allow `status`/`sentAt` through the update
schema, coerce date strings on quote PATCH, correct RFQ numbering to use company settings with a
unique constraint, add the project ownership check.

**Phase 2 — make sending real** (0.3-email, 0.5, 2.4)
Server-side send endpoint: generate a portal token per supplier, render/store the PDF, email via
Resend, set `sentAt`/`status` in one transaction. Add portal-link copy/resend UI. Honour `isActive`,
return terms, advance status on submission.

**Phase 3 — complete the editing surface** (1.1, 1.2, 1.3, 1.6)
Item edit, real attachment upload on both the RFQ and the quote (Replit Object Storage, as used
elsewhere), fix estimate import field mapping with dollars→cents conversion.

**Phase 4 — status model and cleanup** (2.1, 2.5, 2.6)
Settle on one status vocabulary, delete `useRfqStatusOptions.ts` or adopt it, build the
`/rfqs/:id/confirm` page or remove the link, remove dead menu items, fix navigation context.

**Phase 5 — follow-ups and quote lines** (1.4, 1.5)
Needs product decisions: whether follow-ups get a real scheduler, and whether quotes become
line-itemised.
