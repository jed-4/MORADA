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
**File storage:** Cloudflare R2
**Error monitoring:** Sentry (3 DSNs — frontend, backend, mobile)
**AI:** Anthropic Claude (bill reading, summaries) + OpenAI (vision OCR, kept separately)
**Accounting:** Xero integration

---

## Key conventions

### Money
- All monetary values are stored in the database as **cents** (integers)
- `formatCurrency(cents)` divides by 100 and formats as AUD
- GST rate is 10% (Australia)
- Inc GST → Ex GST: `Math.round(incGst / 1.1)`
- Ex GST → Inc GST: `Math.round(exGst * 1.1)`

### Allowances
Two types with different behaviour:
- **Prime Cost (PC)** — client picks the item, builder charges cost + markup
- **Provisional Sum (PS)** — builder estimates, actual cost tracked via bills + timesheets + custom lines
- `item.allowance === "Prime Cost"` determines which UI branch renders
- `item.priceIncTax` = estimate price in cents inc GST
- `actualCost` = actual spend in cents inc GST
- `variance` = `actualCost - priceIncTax` (positive = over budget)

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

All CSS custom properties defined in `client/src/index.css`:

| Token | HSL | Hex | Use |
|---|---|---|---|
| `--primary` | 261 44% 70% | `#A890D4` | Lavender — primary accent, buttons |
| `--primary-light` | 262 48% 95% | `#F2EEF9` | Lavender wash — badges, pills |
| `--background` | 60 15% 98% | `#FAFAF8` | Page background |
| `--card` | 0 0% 100% | `#FFFFFF` | Card background |
| `--sidebar` | 48 20% 95% | `#F5F4F0` | Sidebar background |
| `--foreground` | 20 8% 16% | `#2C2825` | Dark ink — primary text, total bars |
| `--muted-foreground` | 25 5% 40% | `#6B6560` | Secondary text |
| `--border` | 60 5% 91% | `#EAEAE8` | Subtle borders |
| `--amber` | 42 54% 64% | `#D4B670` | Bills section accent |
| `--amber-light` | 42 54% 93% | `#F7EDDA` | Bills section background |
| `--teal` | 184 51% 63% | `#70CAD0` | Timesheets section accent |
| `--teal-light` | 184 51% 93% | `#DFF5F6` | Timesheets section background |
| `--sage` | 147 39% 65% | `#82C8A2` | Custom lines / positive accent |
| `--sage-light` | 147 39% 93% | `#E0F5E9` | Custom lines background |
| `--coral` | 11 52% 70% | `#DA988A` | Error / over-budget accent |
| `--coral-light` | 11 52% 93% | `#F7E5E2` | Error background |

Section cards use a 3px left accent border in the section colour. Use `hsl(var(--amber))` etc in inline styles for dynamic colours.

---

## Key business rules

- All amounts are **inc GST** unless explicitly labelled ex GST
- Schedules track working days — respect `include_saturday` and `include_sunday` flags
- Bills: `bill.total` is cents inc GST; `bill.billNumber` is the invoice number
- Timesheets: `duration` is hours; `total` is cents inc GST
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
