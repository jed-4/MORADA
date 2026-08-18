# Price List — audit & plan

Branch: `feat/price-list` (worktree `morada-price-list/`, off `origin/main` @ a7458a92)
Audited: 2026-08-18. Static read of schema/routes/storage/UI. **No live DB or deployed eyeball yet.**

---

## 1. What exists today

### Data model (`shared/schema.ts`)

| Table | Line | Notes |
|---|---|---|
| `price_list_categories` | 6198 | company-scoped, name unique per company, `color`, `sortOrder`, `isActive` |
| `price_list_items` | 6242 | the catalogue |
| `bill_line_item_price_links` | 6312 | review-workflow audit trail |
| `unit_type` pgEnum | 6223 | 14 hardcoded values |

`price_list_items` columns: `name`, `nickname`, `code` (SKU), `description`, `categoryId`,
`unitType` (enum), `costPrice` **integer cents**, `sellPrice` **integer cents**, `markupPercent`
numeric, `gstInclusive` bool, `supplierId` → **`contacts.id`**, `supplierCode`, `leadTimeDays`,
`brand`, `imageUrl`, `tags` json, `notes`, `isActive`, `lastPriceUpdate`, `priceHistory` json.

**No `.sql` migration ever creates these tables.** They only appear in drizzle *meta snapshots*
(0000/0001/0002/0009/0013), i.e. they were created by `db:push`. Prod existence is unverified.

### Server (`server/routes.ts` 34415–34630, `server/storage.ts` 24694–24940)

17 routes under `/api/price-list/*`: categories CRUD, items CRUD, `items/bulk-update`,
and `review/unlinked|links`. Plus `/api/bill-line-items/unlinked` (18188) and
`/api/bill-line-items/:id/link-price-item` (18205).

Storage does company-scoped reads/writes; `updatePriceListItem` appends to `priceHistory`
on any cost/sell change with `source: "manual"`.

### Client

| File | Lines | Role |
|---|---|---|
| `pages/PriceListPage.tsx` | 45 | header: title, search, "Add Item" |
| `components/systems/PriceList.tsx` | 1071 | the grid + add/edit modal |
| `pages/AIPriceReviewPage.tsx` | 33 | header only |
| `components/systems/AIPriceListReview.tsx` | 648 | bill-line → catalogue matcher |
| `pages/FieldSettings.tsx` | — | category CRUD lives here |
| `SidebarNav.tsx:163-164` | — | Resources → "Price List", "AI Price Review" |

---

## 2. Current layout

**Price List page.** Two stacked 36px bars over a scrolling body.

```
┌ Price List   [🔍 Search items…]                            [+ Add Item] ┐  page header
├ [⇕] [Tag Category ▾] [Building Supplier ▾] [Status ▾]   Group:[▾]  (n items) ┤  toolbar
│ ▼ Framing                                              (12)              │  group header
│   ┌──────┬──────────┬─────┬─────────┬────┬────────┬────────┬────────┐   │
│   │ Name │ Nickname │Code │Supplier │Unit│Cost(ex)│Cost(inc)│ …      │   │  DataTable
```

Columns: Name 180 · Nickname 110 · Code 90 · Supplier 120 · Unit 60 · Cost(ex) 90 ·
Cost(inc) 90 · Sell(ex) 90 · Sell(inc) 90 · Markup 70 · Status 80 · Actions 64.
Row height 28, `storageKey="price-list"` so widths persist. Grouped by Category by default
(also Supplier / None) — **each group renders its own separate `DataTable`**, so column
headers repeat per group and widths are shared but alignment is per-table.

**Add/Edit modal** (480px): Name → Nickname → [Category | Code | Unit] →
a highlighted Pricing block with an **Ex GST / Inc GST toggle** and Cost / Markup / Sell
(each showing the converse figure underneath, plus a "Calculated markup" readout) →
[Supplier | Supplier Code | Lead Time] → Description → "More options" (Brand, Tags, Notes)
→ footer with Active checkbox + Cancel/Save.

**AI Price Review page.** Search bar, then bill lines with no `priceListItemId`, grouped by
supplier with expand/collapse. Per line: "Link" (searchable popover of suggested catalogue
matches) or "Create" (prefills a new catalogue item from the bill line).

---

## 3. It does not work

The feature is **wired into the nav but broken end to end**. Ordered by severity.

### 3.1 All writes fail — wrong `apiRequest` signature 🔴

`apiRequest(url, method, data)` (`shared/api.ts:46`). `PriceList.tsx` calls it fetch-style:

- `:89`  `apiRequest(\`/api/price-list/items/${id}\`, { method: "DELETE" })`
- `:660` `apiRequest("/api/price-list/items", { method: "POST", body: … })`
- `:672` `apiRequest(\`/api/price-list/items/${item?.id}\`, { method: "PATCH", body: … })`

The object lands in the `method` slot → `fetch` gets method `"[object Object]"` → **TypeError,
request never leaves the browser**, and the payload is dropped (`data` is `undefined`).
Create/update surface a red "Failed to…" toast; **delete has no `onError`, so it fails silently.**
`AIPriceListReview.tsx` uses the correct 3-arg form — this bug is confined to `PriceList.tsx`.

**Net effect: nobody has ever successfully created an item from this page.**

### 3.2 Cents vs dollars 🔴

`costPrice`/`sellPrice` are `integer` **cents**. The form submits a *dollar string*
(`"12.50"`). Two failure modes:

- `"12.50"` → Postgres `invalid input syntax for type integer` (22P02) — reject.
- `"12"` → stored as **12 cents**, while `formatCurrency` (`:161`) does `parseFloat` with
  no `/100` and renders **$12.00**. Self-consistent on screen, 100× wrong versus every other
  cents column in the app — so the bill-line comparison in §3.4 is nonsense.

Routes pass `req.body` straight to storage; `insertPriceListItemSchema` (which declares
`costPrice: z.number()`) is **never applied**. No validation layer catches it.

### 3.3 Unit dropdown mostly emits invalid enum values 🔴

Form offers 19 units; the `unit_type` pgEnum has 14. Only **7 overlap**
(`each, m2, m3, kg, day, pack, lot`). The other 12 — `m, lm, t, l, hr, box, roll, sheet,
bag, pallet, item, allowance` — are **not valid enum members** → insert error 22P02.
The enum's own `lin_m`, `hour`, `week`, `tonne`, `litre`, `set`, `pair` aren't offered at all.
The grid also prints the raw token (`lin_m`) rather than a label.

### 3.4 AI Price Review: every query 404s 🔴

Default `queryFn` builds the URL as `queryKey.join("/")` (`shared/api.ts:78`).
All four queries append `companyId` as a path segment:

| queryKey | resolves to | result |
|---|---|---|
| `['/api/bill-line-items/unlinked', companyId]` | `…/unlinked/<id>` | no route → 404 |
| `['/api/price-list/items', companyId]` | `…/items/<id>` | hits `items/:id`, 404 "Item not found" |
| `['/api/price-list/categories', companyId]` | `…/categories/<id>` | no route → 404 |
| `['/api/suppliers', companyId]` | `…/suppliers/<id>` | hits `suppliers/:id`, wrong shape |

**The page renders empty forever.** Also: the "AI" is not AI — `fuzzyMatch` (`:65`) is a
substring/word-overlap scorer. Either wire it to a real matcher or rename it.

### 3.5 Supplier picker writes the wrong table's ID 🔴

`priceListItems.supplierId` FKs **`contacts.id`**. The picker is fed `/api/suppliers`, and
`getSuppliers` selects from the **legacy `suppliers` table**. Saving a supplier therefore
violates the FK (23503) — or, if the constraint isn't enforced in the DB, stores a dangling
id that never resolves, so the Supplier column always shows `-`.

Note the app already has a `supplierMatcher` in `shared/` and bills use `contacts`;
the `suppliers` table is the legacy side.

### 3.6 Tenancy holes on the review links 🟠

- `POST /api/price-list/review/links` → `storage.createBillLineItemPriceLink(req.body)` —
  **no check that `billLineItemId` belongs to the caller's company.** Cross-tenant write.
- `PATCH /api/price-list/review/links/:id` → `updateBillLineItemPriceLink(id, req.body)` —
  **no `companyId` scoping at all.** Any authenticated user can mutate any company's link row.

Consistent with the six structural shapes in the tenant audit — the fix is query-layer scoping.

### 3.7 Cost prices exposed to non-team users 🟠

Every `/api/price-list/*` route is `requireAuth` **only**. Sibling catalogue routes
(`/api/suppliers`) use `requireAuth, requireTeamMember`. So a **client-portal or supplier
login can read the whole company catalogue including cost prices and margins.**
(Also note `requireTeamMember` short-circuits entirely in `NODE_ENV=development`.)

### 3.8 Smaller

- **Delete has no confirmation guard beyond a dropdown item** labelled "Confirm Delete", and
  no `onError` — a failed delete is invisible.
- **`bulkUpdatePriceListItems` loops** `updatePriceListItem` one row at a time — each is a
  SELECT + UPDATE, so a 200-row bulk edit is 400 sequential round trips ≈ **160 s** at
  Neon-us-east-1↔AU latency (~400 ms/RT). Must become a single statement.
- **Grid `queryFn` uses bare `fetch`**, bypassing `getApiBaseUrl()` and `credentials`
  — works same-origin on web, **breaks in the Capacitor/Expo mobile shell**.
- **Search is `LIKE` on 4 columns** with no trigram/GIN index; `code_idx` is
  `(companyId, code)` and unused by it.
- **No pagination** — every item for the company is fetched on every keystroke
  (`searchQuery` is in the queryKey with no debounce).
- **`gstInclusive` column is dead** — never read or written; the modal's Ex/Inc toggle is
  local UI state only.
- **`priceHistory` is written but never displayed.**
- `markupPercent` is stored *and* derivable from cost/sell, with no rule for which wins —
  the modal recomputes `sellPrice` from markup on edit, so they can silently disagree.

---

## 4. A second catalogue exists — but it is NOT a duplicate

**Resolved by Jed 2026-08-18:** Product Library is for **selections/spec** (colours,
finishes, attributes that are not price-dependent). Price Lists are for **costing**.
Both stay. The overlap noted below is real at the column level but not at the purpose
level — do not merge them. Original notes retained for context:

### (original audit note)

`/product-library` → `products` table (`pages/ProductLibrary.tsx`, 362 lines):
`name, brand, sku, description, category, subcategory, supplierContactId, defaultUnitCost`
(**cents**), `unitType` (free text), `url`, `notes`, `isActive` + a `product_images` child table.

That is ~80% the same entity, with **working** CRUD, correct `apiRequest` calls, a proper
`contacts` FK, and image support the price list lacks. `products` is referenced by nothing
except `product_images`; `price_list_items` is referenced by nothing except `bill_line_items`
and the link table.

**Two orphaned catalogues, neither connected to estimates.** A decision is owed before
building anything (see §6, step 0).

---

## 5. Nothing consumes it

`priceListItemId` exists on `bill_line_items` only, set solely by the (broken) review page.
**No estimate, scope, RFQ, PO, selection, variation or allowance reads the price list.**
It is a data island — which is why the bugs above survived: the page has almost certainly
never been used in anger.

---

## 6. Plan

### Step 0 — RESOLVED, no longer blocking
Keep both. Product Library = selections/spec (colours, finishes, non-price attributes).
Price Lists = costing. See `PRICE_LIST_STRUCTURE.md` for the library restructure that
replaces the rest of this plan's PR ordering.

### PR1 — Repair (make it work at all)
Pure bug-fix, no new surface.
1. Fix the three `apiRequest` call sites in `PriceList.tsx`.
2. Settle money: store **cents** everywhere; form converts dollars→cents on submit and
   cents→dollars on load; `formatCurrency` divides by 100. Add a migration only if live rows
   exist (§7). Follows [[morada-money-rules]] — cents integers are the dominant convention.
3. Validate on the server: run `insertPriceListItemSchema` in the POST/PATCH handlers instead
   of passing `req.body` through.
4. Units: drive the dropdown from the company's **Field Settings `estimate_item.unit`** list
   (per the confirmed decision in morada-money-rules), normalise via the existing
   `shared/units.ts`, and either widen the pgEnum or move `unitType` to text. Label the
   grid's unit column.
5. Point the supplier picker at **contacts** (`contactType = 'supplier'`), matching the FK.
6. Fix the four `queryKey`s in `AIPriceListReview.tsx` (drop the `companyId` segment).
7. Add `credentials`/`getApiBaseUrl` to the grid's `queryFn`.
8. Add `onError` + a real confirm to delete.

### PR2 — Secure
1. `requireTeamMember` on all 17 `/api/price-list/*` routes.
2. Company-scope `create/updateBillLineItemPriceLink` (verify the bill line's project's
   company, like `getOwnedBill` does).
3. Ship the **first real `.sql` migration** for these three tables so prod state is knowable
   rather than db:push drift. Verify against prod by row count, not host name
   (see [[morada-prod-database-ops]]).

### PR3 — Make it usable
1. Single-statement bulk update; **inline grid editing** of cost/sell/markup (reuse the
   `spreadsheet/useGridNavigation` hook from the Details work).
2. One `DataTable` with group rows instead of N tables — fixes the repeated headers.
3. Debounced + server-paginated search; a trigram index on name/nickname/code.
4. **CSV/Excel import + export** with the column-mapping UX already built for
   `ImportEstimateItemsDialog`. This is the single biggest adoption unlock — nobody types
   a 2,000-line catalogue by hand.
5. Surface `priceHistory` as a sparkline + "last updated" column; make `gstInclusive` real
   or drop the column.

### PR4 — Connect it (the actual point)
1. Add `priceListItemId` to `estimate_items` for **provenance**.
2. Catalogue picker in the estimate grid: pick an item → fills name/unit/unit cost.
3. **Drift detection**: "N lines are below current catalogue price" + one-click re-price.
   Requires the units reconciliation from PR1 (estimate cost is `doublePrecision` *dollars*,
   catalogue is integer *cents* — convert at the boundary; do **not** widen the Phase-2
   cents migration, which is parked).
4. Same picker for PO and RFQ lines.

### PR5+ — Make it great
- **Assemblies** — "Slab Pour" expands into concrete + pump + labour with parameter-driven
  quantities, composed of catalogue items, staying linked. Already Jed's #1 in
  [[morada-estimates-roadmap]]; the price list is its prerequisite.
- **Supplier price files** — import a supplier's price book, diff against held prices,
  approve changes in bulk. Turns the catalogue into a living thing.
- **Close the bill loop properly** — when a bill line is linked, offer "supplier now charges
  $X, catalogue says $Y — update?" with `source: "bill"` in `priceHistory`. This is what the
  AI Review page was reaching for; with real prices it becomes genuinely valuable.
- **Real matching** to replace `fuzzyMatch` — supplier + supplierCode exact match first,
  then trigram, then an LLM pass over the remainder. Only then call it AI.
- Per-supplier price variants for the same item; effective-dated prices.

---

## 7. Open questions / to verify live
- Do `price_list_items` rows exist in **dev** and **prod**? Determines whether PR1 needs a
  data-repair migration or just a code fix. (No DB access this session.)
- Do the three tables even exist in prod, given no `.sql` migration ever created them?
- Step 0: fold Product Library in, or delete the price list?
- Is `suppliers`-vs-`contacts` being unified elsewhere? Don't fix it twice.
