# Price Lists as a library — proposed structure

Supersedes the flat-catalogue assumption in `PRICE_LIST_PLAN.md` §3–6.

## The shift

Today: **one flat catalogue per company**, with `price_list_categories` as the only grouping.
Proposed: **a library of price lists**, each a book of items.

```
Price Lists (library)
├── The Plaster Shop      supplier · 340 items · eff. Jul 2026
├── Bunnings              supplier · 1,204 items
├── Carpentry Labour      labour   · 12 rates
└── Morada Design Items   internal · 85 items
```

This is the standard model (simPRO supplier catalogues, Buildxact price lists,
Buildertrend cost catalogues). The existing item grid becomes the *inside* of a list.

**Do this now, not later: both catalogues are empty (0 rows in dev).** Adding the parent
table today is a schema change with no data migration. After go-live it is a backfill.

---

## Schema

### New: `price_lists`

```ts
export const priceListKindEnum = pgEnum("price_list_kind", [
  "supplier",   // someone else's price book — The Plaster Shop, Bunnings
  "labour",     // your own labour/charge rates — Carpentry Labour
  "internal",   // your own items — Morada Design Items
]);

export const priceLists = pgTable("price_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: priceListKindEnum("kind").notNull().default("supplier"),
  supplierId: varchar("supplier_id").references(() => contacts.id, { onDelete: "set null" }),
  description: text("description"),
  colour: text("colour"),                       // library-card identity
  isDefault: boolean("is_default").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  effectiveFrom: timestamp("effective_from"),   // supplier books are dated
  effectiveTo: timestamp("effective_to"),
  sourceNote: text("source_note"),              // "Q3 2026 trade price book (PDF)"
  lastImportedAt: timestamp("last_imported_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt, updatedAt,
}, (t) => ({
  companyIdx: index("price_lists_company_idx").on(t.companyId),
  uniqueNamePerCompany: uniqueIndex("price_lists_name_unique").on(t.companyId, t.name),
}));
```

### Changed: `price_list_items`

- `+ priceListId` → `price_lists.id`, `onDelete: "cascade"`, **NOT NULL** (after backfill).
- `+ costCodeId` → `cost_codes.id` nullable. Currently missing, and needed so an item
  carries its cost code into an estimate line. Cheap to add now.
- `supplierId` becomes **redundant for supplier lists** (the list owns the supplier).
  Keep the column for `internal` lists where items come from mixed suppliers; on a
  `supplier` list, inherit from the parent and hide the field.

### Retired: `price_list_categories` → new `price_list_groups`

**DECIDED 2026-08-19 (Jed): groups live INSIDE a price list.** The hierarchy is

```
Price List  →  Group  →  Item
price_lists    price_list_groups    price_list_items
```

"Plasterboard", "Cornice", "Compounds" belong to The Plaster Shop's book and
nowhere else; Bunnings has its own "Timber", "Fixings". The old
`price_list_categories` were company-GLOBAL, sitting outside any list, which is
what made the layering ambiguous.

`price_list_groups` mirrors `estimate_groups` — `priceListId`, `name`,
`sortOrder`, unique name per list — so the grid can reuse its reorder/collapse
behaviour. `price_list_items.groupId` is `ON DELETE SET NULL`: deleting a section
must not delete the prices in it, they fall back to "Ungrouped".

`price_list_categories` is dropped, and its Field Settings CRUD removed. The
migration converts any existing category into a group on the list its items
landed in (a no-op at 0 rows).

**Trade-off accepted:** cross-list comparison ("all plasterboard everywhere") can
no longer come from the grouping, since groups are per-list. The compare view
matches on item name/code instead.

---

## `kind` drives the form and columns

This is what stops it feeling generic. Today the modal shows every field for everything.

| kind | key columns | hidden |
|---|---|---|
| `supplier` | code, supplier code, **cost**, lead time, category | supplier picker (inherited) |
| `labour` | role/task, unit=hour, **cost rate**, **charge rate** | supplier code, lead time, brand |
| `internal` | name, description, image, **sell**, markup | supplier code, lead time |

A supplier list is about **what you pay**. An internal/design list is about **what you
charge**. A labour list is a **rate card**. Same table, three lenses.

---

## Navigation

| Route | Page |
|---|---|
| `/price-lists` | **the library** — cards or table: name, kind badge, supplier, item count, effective dates, last updated, status. Filter by kind. "New price list". |
| `/price-lists/:id` | **the list** — today's grid, scoped. Breadcrumb back. Header shows supplier, effective dates, item count, Import / Export / Archive. |
| `/price-lists/search` | **cross-list search** — the view that makes it a library rather than folders (below). |
| `/price-list` | 301 → `/price-lists` |

Sidebar: "Price List" → **"Price Lists"**. Inside a supplier list the Supplier filter
disappears (the list *is* the supplier) and Group-by defaults to Category.

### The cross-list view is the killer feature

Search `90x45 pine` across every list →

```
90x45 Pine H2          Bunnings           $12.50/lm   eff. current
90x45 Pine H2 MGP10    Timber Merchant    $10.80/lm   eff. Jul 2026   ← cheapest
90x45 Pine treated     The Plaster Shop   $13.95/lm   archived
```

Build this early. Without it, price lists are just folders; with it, they answer
"who is cheapest for this?" — which is the reason to keep more than one.

---

## Re-import with diff (what lists unlock)

With a list header, a supplier sending a new price book becomes:

> **The Plaster Shop — Q4 2026 import.** 43 prices changed (avg +4.2%), 6 new items,
> 2 no longer listed. [Review] [Apply all]

Per-item changes append to the existing `priceHistory` json with `source: "import"`.
Optionally roll the old list to `effectiveTo` and keep it archived for audit.
This is impossible to express against a flat catalogue, and it is the single biggest
day-to-day time saver for a builder.

---

## Migration

1. Create `price_list_kind` enum + `price_lists` table.
2. Add `price_list_id` (nullable) + `cost_code_id` to `price_list_items`.
3. Backfill: per company holding items, insert one list `"General"` (kind `internal`)
   and point its items at it. **Currently a no-op — 0 rows in dev.**
4. `SET NOT NULL` on `price_list_id`.
5. Ship as the **first real `.sql` migration** for this feature (see plan §3 — these
   tables only ever existed as `db:push` drift).

---

## Revised PR order

The restructure and the repair touch the same components, so doing repair first means
building the grid and modal twice. Fold them together.

- **PR1 — Structure + repair.** `price_lists` table & migration, library page, list detail,
  route changes, *plus* all of plan §6 PR1 (apiRequest signature, cents, server validation,
  units, supplier→contacts, review-page queryKeys).
- **PR2 — Secure.** `requireTeamMember`, scope the review-link routes.
- **PR3 — Import/export per list**, then re-import with diff. Far more natural now:
  you import a supplier's spreadsheet *into a list*.
- **PR4 — Connect to estimates.** `priceListItemId` + `costCodeId` provenance on
  `estimate_items`; catalogue picker; drift detection.
- **PR5 — Cross-list compare, assemblies, supplier price files.**

---

## Open decisions

1. **Can one item live in two lists?** Recommend **no** — an item belongs to exactly one
   list, and "90x45 pine" existing in both Bunnings and Timber Merchant is two rows.
   Simple, matches how supplier catalogues really work, and the cross-list view matches
   on normalised name + unit. The alternative (master item + per-supplier price rows) is
   the textbook model and better for price comparison, but roughly doubles PR1 and adds a
   join to every read. Designed so it can be added later as a nullable `masterItemId` —
   additive, not a rewrite.
2. ~~Categories global or per-list?~~ **RESOLVED: per-list groups** (above).
3. **Product Library — RESOLVED (Jed, 2026-08-18): keep both, they are different things.**
   Product Library is for **selections/specification** — colours, finishes and other
   attributes that are not price-dependent. Price Lists are for **costing**. They are not
   duplicates and neither is retired. A `kind: "internal"` price list ("Morada Design
   Items") is the *priced* catalogue of your own items; a Product Library product is the
   *spec* record a client selection points at.
   Future (not this PR): an optional `productId` on `price_list_items`, so a selection's
   product can resolve a cost without duplicating the spec.
