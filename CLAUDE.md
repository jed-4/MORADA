# Morada — Project Brief for Claude Code

Morada is a residential building project management app for Lighthouse Projects (Australia).
Built by Jed Smith — jed@lighthouseprojects.com.au

---

## Stack

**Frontend:** React 18 + TypeScript + Vite + Wouter (routing) + TanStack Query + shadcn/ui + Tailwind CSS
**Backend:** Express + TypeScript + Drizzle ORM + PostgreSQL (Neon)
**Mobile:** Expo React Native
**Auth:** Express sessions + Google OAuth
**Email:** Resend
**File storage:** Replit Object Storage (GCS-backed sidecar at 127.0.0.1:1106; see server/replit_integrations/object_storage). NOTE: no Cloudflare R2 in the codebase today.
**Error monitoring:** Sentry (3 DSNs — frontend, backend, mobile)
**AI:** Anthropic Claude only — bill reading (server/services/aiBillReader.ts), summaries, and vision OCR. NOTE: no OpenAI/Mindee OCR path exists in the codebase.
**Accounting:** Xero integration

---

## Key conventions

### Money
**Use `shared/money.ts` for ALL conversions and formatting — never hand-roll `* 100` / `/ 1.1`.**

Three storage conventions coexist (see shared/money.ts header for the full map):
1. **Cents as integers** — the dominant convention (~90% of tables): bills, invoices, POs, variations, budgets, allowance items/allocations, selections, projects, price list
2. **Dollars as float doubles** — `estimate_items` price fields (`unitCostExTax`, `taxAmount`, `priceIncTax`) and `variation_items.unitCostExTax`. 2dp policy via `shared/pricing.ts round2`
3. **Dollars as numeric(10,2)** — timesheets, timesheet_cost_codes, user/contact hourly rates. **Drizzle returns these as STRINGS** — use the `timesheet*` accessors in shared/money.ts

- `formatCents(cents)` in shared/money.ts is the canonical AUD formatter (takes cents)
- GST rate is 10% (Australia): `exGstFromInc` / `incGstFromEx` / `gstSplit` in shared/money.ts
- **Labour is EX GST**: `timesheets.total` = hours × rate with no GST component. Gross up ×1.1 when comparing against inc-GST client prices
- `estimate_items.priceIncTax` is a denormalised cache — populated ONLY via `resolveEstimateStoredPrice` in shared/pricing.ts; recompute rather than trust it on read paths

### Allowances
Two types with different behaviour:
- **Prime Cost (PC)** — client picks the item, builder charges cost + markup
- **Provisional Sum (PS)** — builder estimates, actual cost tracked via bills + timesheets + custom lines
- `item.allowance === "Prime Cost"` determines which UI branch renders
- `estimate_items.priceIncTax` = the line's **pre-margin** amount in **dollars** inc GST (NOT cents; estimate_items price fields are `doublePrecision` dollars). The builder's margin (project markup) is applied ONCE globally at the estimate subtotal — it is never baked into the per-line cache, so editing the project margin never staleifies a cached row. Recompute priced lines via `computeEstimateItemPrice` on read; only fixed-price (unitCost 0) allowance lines trust the cache.
- Allowance `actualCost` = actual spend in cents inc GST (allowance tables are cents)
- `variance` = `actualCost - priceIncTax` (mind the unit boundary: convert dollars→cents)

### API / Data fetching
- TanStack Query with pattern: `useQuery({ queryKey: ["/api/route"] })`
- No explicit queryFn needed for standard routes — the global fetcher handles it
- Mutations use `useMutation` + `apiRequest(url, method, body)`

### Component structure
- Pages live in `client/src/pages/`
- Shared components in `client/src/components/`
- API routes in `server/routes.ts`
- DB schema in `shared/schema.ts` (Drizzle)
- Services in `server/services/`

---

## Design system (Morada)

All CSS custom properties defined in `client/src/index.css`. **Values below are
what the stylesheet actually ships** — verified against `:root` on 2026-08-26.
Tokens are stored as HSL; the hex is derived, so a ±1 difference from a design
file is rounding, not drift.

| Token | HSL | Hex | Use |
|---|---|---|---|
| `--primary` | 270 16% 53% | `#87749A` | Deep plum — primary accent, buttons |
| `--primary-light` | 270 36% 95% | `#F2EEF7` | Plum wash — badges, pills |
| `--background` | 38 40% 96% | `#F9F6F1` | Page background |
| `--card` | 0 0% 100% | `#FFFFFF` | Card background |
| `--sidebar` | 40 33% 98% | `#FCFAF8` | Sidebar background |
| `--foreground` | 26 9% 16% | `#2C2825` | Dark ink — primary text, total bars |
| `--muted-foreground` | 27 5% 40% | `#6B6561` | Secondary text |
| `--border` | 60 5% 91% | `#E9E9E7` | Subtle borders |
| `--amber` | 42 54% 64% | `#D5B772` | Bills section accent |
| `--amber-light` | 41 53% 94% | `#F8F3E8` | Bills section background |
| `--teal` | 184 51% 63% | `#71CAD1` | Timesheets section accent |
| `--teal-light` | 187 53% 94% | `#E8F6F8` | Timesheets section background |
| `--sage` | 147 39% 65% | `#83C9A2` | Custom lines / positive accent |
| `--sage-light` | 147 38% 94% | `#EAF6EF` | Custom lines background |
| `--coral` | 11 52% 70% | `#DA998B` | Error / over-budget accent |
| `--coral-light` | 14 52% 95% | `#F9EFEC` | Error background |

**⚠️ The stylesheet and the Figma file disagree. The stylesheet is what runs.**
This table used to document the Figma values, which meant it was wrong about
the brand colour — it said `--primary` was `#A890D4` lavender when the app has
shipped `#87749A` deep plum since the April 2026 "warmer, more cohesive
interface" pass. The four accent hues (amber, teal, sage, coral) do match Figma
within rounding. What diverged in that pass and was never reflected back:

| Token | Figma | Ships | ΔE |
|---|---|---|---|
| `--primary` | `#A890D4` | `#87749A` | 20.1 |
| `--amber-light` | `#F7EDDA` | `#F8F3E8` | 4.9 |
| `--sage-light` | `#E0F5E9` | `#EAF6EF` | 4.3 |
| `--coral-light` | `#F7E5E2` | `#F9EFEC` | 4.1 |
| `--teal-light` | `#DFF5F6` | `#E8F6F8` | 2.9 |
| `--sidebar` | `#F5F4F0` | `#FCFAF8` | 2.5 |
| `--background` | `#FAFAF8` | `#F9F6F1` | 2.2 |

Figma also contradicts itself on the brand colour: the "1 — Colour Tokens"
frame swatches LAV as `#A68AC7`, while a component spec note in the same file
says `--primary (#A890D4)`. Neither is what ships. Resolving this is a design
decision, not a refactor — `--primary` has ~1,600 usages across ~220 files.

`--primary` is also redefined as `261 44% 60%` inside `.dark-warm-g`, an opt-in
light-mode variant applied only when `localStorage["dark-warm-variant"] === "g"`
(default is `none`), so it is not what most users see.

Section cards use a 3px left accent border in the section colour. Use `hsl(var(--amber))` etc in inline styles for dynamic colours.

---

## Key business rules

- All amounts are **inc GST** unless explicitly labelled ex GST
- Schedules track working days — respect `include_saturday` and `include_sunday` flags
- Bills: `bill.total` is cents inc GST; `bill.billNumber` is the invoice number
- Timesheets: `duration` is hours; `total` is **dollars EX GST as a numeric string** (hours × rate, no GST — wages aren't a taxable supply). Timesheet-allowance allocation `amount` is ex-GST cents
- Purchase Orders link to subcontractor timesheets and get matched to incoming bills
- Project hierarchy: Business → Project → (Estimates, Bills, Schedule, Allowances, Timesheets, Site Diary, Selections)

---

## GitHub
https://github.com/jed-4/MORADA

## Environment variables
Never commit `.env`. Key variables:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ANTHROPIC_API_KEY` — Claude AI
- `SESSION_SECRET` — Express sessions
- See Replit Secrets panel (or Render env vars) for full list
