# Morada UI/UX Audit

**Date:** 14 July 2026
**Scope:** all 120 pages in `client/src/pages/` and 118+ components in `client/src/components/` (~173,000 lines), audited in six parallel passes: global design-token sweep, shared components, financial pages, core/project/navigation, scheduling/time, settings/templates/auth/portals.
**Status:** report only — no changes made.

---

## Executive summary

The design system in `client/src/index.css` is solid and the `ui/` primitives are almost fully compliant — the debt is in the pages. Four cross-cutting problems account for most of the inconsistency:

1. **~1,500 raw Tailwind palette classes bypass the Morada tokens** (~1,130 status colours + ~347 blue/purple + gray). One repeated badge idiom (`bg-green-100 text-green-700 dark:bg-green-900/30 …`) accounts for the majority; migrating that single pattern to the existing `--status-*` tokens clears most of it.
2. **Shared components exist but are not used.** `EmptyState.tsx` is imported by **zero** files while ~45+ pages hand-roll empty states. `StatusBadge.tsx` is used by only ~5 financial pages and 22 elsewhere, while 22+ other files ship local `getStatusBadge`/`statusConfig` helpers — `Estimates.tsx` defines it *twice with different looks*.
3. **Destructive actions are dangerously inconsistent.** At least 9 pages delete **with no confirmation at all** (7 template list pages, ChecklistTemplates, SiteDiaryTemplates, plus Contacts archive), ~12 more use off-brand native `confirm()`, and the rest use the proper `AlertDialog`.
4. **Massive near-duplicate page scaffolding**: 8 template list pages (~8,000 lines), 7 template detail pages, 3 parallel widget frameworks (including two diverged copies of `PinnedItemsWidget`, 1,310 lines combined), 4 calendar implementations, and 6 Category/CostCode dialogs that are ~95% identical.

Also one outright **broken flow**: the landing page's "Get Started" / "Log In" buttons point to `/api/login` (dead legacy Replit OIDC endpoint) instead of `/auth`.

---

## 1. Design system inconsistencies

### 1.1 Global numbers (token sweep)

| Category | Occurrences | Notes |
|---|---|---|
| 6-digit hex literals | 760 total; **~330 real debt** | ~430 are in react-pdf `*Document.tsx` components which *cannot* use CSS variables — treat as compliant-by-necessity |
| Tailwind green/red/yellow/orange/amber/teal classes | **~1,133** | status colours bypassing `--sage`/`--coral`/`--amber` |
| Tailwind blue/indigo/purple/sky/cyan classes | **~347** | no status meaning; nearly all should collapse to `--primary` |
| Tailwind gray/slate/zinc classes | ~30 | should be `text-muted-foreground` / `border-border` |
| rgb()/rgba() literals | 81 | mostly drag-glow/overlays; some hand-mixed token tints |
| Inline `style` colour literals | 175 (vs 398 compliant `hsl(var(--…))`) | the codebase knows the pattern; violations are drift, not ignorance |

### 1.2 Worst offenders — raw palette classes

| File | Count |
|---|---|
| `pages/EstimateDetail.tsx` | 67 |
| `pages/ProjectScope.tsx` | 59 |
| `pages/PurchaseOrders.tsx` | 58 |
| `pages/ClientInvoiceDetail.tsx` | 55 |
| `components/CustomizableProjectOverview.tsx` | 41 |
| `pages/Timesheets.tsx` | 37 |
| `pages/ProjectSettings.tsx` | 37 |
| `pages/Settings.tsx` | 35 |
| `pages/RFQDetail.tsx` | 35 |
| `components/widgets/ScheduleWidget.tsx` | 33 |
| `pages/VariationDetail.tsx` | 27 |
| `pages/TradesPortal.tsx` | 25 |

**The recurring semantic errors:** emerald/green for positive (should be `--sage`), red for errors/over-budget (should be `--coral`), blue/purple decoration (should be `--primary`). Many files are *half-migrated*: light mode uses a token but dark mode falls back to raw Tailwind, e.g. `EstimateDetail.tsx:4517` — `'bg-green-100 text-status-success border-green-200 dark:bg-green-900/30 dark:text-green-400'`.

### 1.3 Hardcoded hex highlights

| Page/component | Issue | Fix |
|---|---|---|
| `pages/TeamManagement.tsx` (L217–384) | **27 hex** — status colour objects with `#ef4444`/`#f59e0b`/`#10b981` + alpha-suffix tricks (`#f59e0b15`) | Use `--coral`/`--amber`/`--sage`; alpha variants map to existing `-light` tokens |
| `pages/PurchaseOrderDetail.tsx:107` | Local `TOKENS` object redefines the palette with **foreign hexes**: `green:"#68b088"` (≠ sage), `amber:"#e8952a"` (≠ amber) | Reference `hsl(var(--sage))` / `hsl(var(--amber))` |
| `pages/ProjectSettings.tsx` (L90, 266, 341, 1108, 1112) | `"#A890D4"` literal fallback ×5 — defeats theming | `hsl(var(--primary))` |
| `pages/Settings.tsx` (L1420, 1514–1534) | `#3B82F6` (foreign blue) brand-colour fallbacks | `hsl(var(--primary))` |
| `pages/FieldSettings.tsx` (L214, 642, 651, 1232) | `#A890D4` literals | `hsl(var(--primary))` |
| Also: `HBCFTracker.tsx` (58/327/403), `VariationPortal.tsx:60`, `CreateProjectDialog.tsx:341`, `BusinessOverheads.tsx:520` (`text-[#8b6db5]` hand-picked lavender) | Brand hex as literal | Tokens |
| `components/TaskDetailModal.tsx` (L50–54) | Priority palette in raw hex (`#dc2626`, `#f97316`, `#eab308`, `#22c55e`, `#6b7280`) | Map to coral/amber/sage/muted tokens |
| `client/src/index.css` (L1014–1061) | The design-system file itself hardcodes foreign blues: `rgba(59,130,246,…)` in `.drop-zone-active`, `#3b82f6`/`#10b981`/`#6b7280` in `.hierarchy-level-*` | Re-express in Morada tokens |

### 1.4 Section identity not carried through

- **`BillDetail.tsx` has 0 amber references and 0 design tokens at all** — the bills detail page doesn't carry the amber identity the Bills list implies. Meanwhile `PurchaseOrders.tsx` uses amber heavily (10 refs) even though POs aren't bills, diluting the convention.
- **`Timesheets.tsx` (the teal section) uses zero teal** — statuses are hardcoded hex `#22c55e/#f59e0b/#ef4444` (L1841–1843) borrowing sage/coral instead.
- **The 3px left-accent-border card convention is effectively unimplemented**: `border-l-[3px]` appears **0 times** in the whole client tree. Either implement it in shared Card usage or drop it from the spec.

### 1.5 Page headers / typography chaos

Three-plus title conventions coexist:

| Convention | Where |
|---|---|
| `text-sm font-semibold` (toolbar-style, `<h2>`) | Contacts, Suppliers, Trades, ProjectFiles (ProjectTeam same look but `<h1>`) |
| `text-2xl font-semibold` / `font-bold` | Settings, BusinessMetrics, FieldSettings (main) |
| `text-3xl font-bold` | Notes, Docs, RolesPermissions, FieldSettings (sub-sections!) |

`FieldSettings.tsx` mixes `text-2xl` main title with `text-3xl` sub-sections in the same page. `ProjectActivity` has no page title at all. Settings pages each invent their own header container (`h-14` stack / `p-6 max-w-6xl` / `h-9` / none).

**Fix:** one shared `<PageHeader>` (title + description + actions slot) with a single scale and `<h1>` semantics.

---

## 2. Component inconsistencies

### 2.1 Duplicated implementations to consolidate

| # | What | Evidence | Consolidation |
|---|---|---|---|
| A | **Status badges** | `StatusBadge.tsx` is good but only adopted in ~22 files; 22+ others ship local `getStatusBadge`/`getStatusColor`/`statusConfig` (ProjectList, TaskList, Bills, Estimates, Schedule, Proposals, defects/…). `Estimates.tsx` defines `getStatusBadge` **twice** (L332 solid-fill, L850 translucent pill) with different looks | Extend `StatusBadge` to accept a dynamic colour (for field-setting-driven statuses), then delete every local helper |
| B | **Priority colours** | Same label+colour map duplicated across 14 files (TaskDetailModal, TaskCard, FilterPanel, FocusBlockPanel, tasks/*, 6 widgets) | Single `priorityConfig` module + `<PriorityBadge>` |
| C | **Template list pages** | 8 pages, ~8,000 lines, same fingerprint (EstimateTemplates 1,862 · SelectionTemplates 1,228 · ScheduleTemplates 1,142 · TaskTemplates 1,082 · RfqTemplates 898 · RfiTemplates 862 · ScopeTemplates 622 · POTemplates 563) | One config-driven `<TemplateListPage>` |
| D | **Template detail pages** | 7 pages with near-identical scaffolding (2× useParams, 3× useQuery, create/edit dialogs) | Generic `<TemplateDetailPage>` |
| E | **Widget frameworks ×3** | `widgets/` (WidgetContainer 327 + Registry 285), `user-workspace/widgets/` (PersonalWidgetContainer 243 + Registry 212), `business-widgets/` (BusinessWidgetContainer + Registry). `PinnedItemsWidget` exists **twice** (895 + 415 lines, diverged) | One generic Container + Registry parameterised by widget set; merge PinnedItemsWidget with a `scope` prop |
| F | **Calendars ×4** | Schedule.tsx (react-big-calendar + `schedule-calendar.css`), TaskCalendar.tsx (react-big-calendar, unstyled — the CSS is only imported by Schedule), EnhancedCalendar (custom grid, used by Personal/BusinessCalendar), ProjectCalendar (dead stub with `console.log` navigation) | Standardise on EnhancedCalendar; retire the rest |
| G | **Category/CostCode dialogs ×6** | Add/Edit pairs ~95% identical (~1,230 lines total) | One `<EntityFormDialog mode="add|edit">` + one `<MergeEntityDialog>` |
| H | **Select components** | UserSelect/ContactSelect/CostCodeSelect/TaskTemplateSelect wrap `SearchableSelect` (good); AssigneeSelect (240), ProjectSelect (172), MultiUserSelect (182) hand-roll their own Popover — two visual languages for one control | Add `multiple` + grouping to `SearchableSelect`, fold the three in |
| I | **Bulk Xero mapping dialogs ×2** | `BulkXeroMappingDialog` (375) vs `BulkXeroContactMappingDialog` (321) — same auto-match logic and layout, one uses raw `Select`, the other `SearchableSelect` | One generic mapper component |
| J | **Working-day logic** | `isNonWorkingDay`/`addWorkingDays`/`countWorkingDays`/`snapToWorkingDay` re-implemented in both Gantt.tsx (~L1454–1510) and Schedule.tsx (~L1161–1180); `lib/scheduleCascade.ts` exists but isn't the source of truth | One shared hook/util reading `includeSaturday`/`includeSunday` |
| K | **Portal shells ×5** | Trades/Selection/RFQ/Proposal/Variation portals: backgrounds vary (`bg-background`/`bg-muted`/`bg-muted/30`/`bg-muted/40`), Card vs hand-rolled divs, footer "Generated by" / "Powered by" / absent, **no Morada logo on any portal**; each re-implements its own loading + "link not found" states | `<PortalLayout>` + `<PortalStateBoundary>` |
| L | **Coming-soon stubs** | SystemDocuments.tsx & SystemProcesses.tsx are byte-identical 19-line stubs | Single `<ComingSoonSection>` |

### 2.2 Dead code (zero imports anywhere)

| File | Note |
|---|---|
| `components/TaskForm.old.tsx` | superseded by TaskForm.tsx |
| `components/GanttPDFExport.tsx` | also carries hardcoded hex |
| `components/WarmPaletteSwitcher.tsx` | |
| `components/EmptyState.tsx` | polished, documented, **never imported** — adopt or delete (adopt; see §3.2) |
| `components/ProjectList.tsx` | BusinessProjects only uses ProjectBoard; carries 12 raw-palette classes |
| `components/ProjectOverview.tsx` | only imported by its own example file; live dashboard is CustomizableProjectOverview |
| `pages/Calendar.tsx` → `ProjectCalendar.tsx` | non-functional stub: no data, `console.log` navigation, hardcoded legend |

Not dead but nearly: `pages/BusinessOverview.tsx` is a 4-line re-export of `components/BusinessOverview.tsx` (harmless).

### 2.3 Currency formatting

`formatCurrency` is well adopted overall. Gaps: `AllowanceDetail.tsx:350` hand-builds `` `${qty} × $${unitCost.toFixed(2)}` ``; `ProposalPortal.tsx` uses raw `$${(cents/100).toFixed(2)}`. Pages with zero `formatCurrency` worth spot-checking: LabourEstimate, BusinessOverheads, HBCFTracker, ProposalDetail, AIPriceReviewPage.

---

## 3. UX issues

### 3.1 Destructive actions — three patterns coexist, some missing entirely

**No confirmation at all (data-loss risk):**

| Page | Detail |
|---|---|
| TaskTemplates, EstimateTemplates, ScheduleTemplates, SelectionTemplates, RfiTemplates, RfqTemplates, POTemplates | dropdown → `deleteMutation.mutate(id)` directly |
| ChecklistTemplates.tsx (L307–311), SiteDiaryTemplates.tsx (L461–465) | same |
| Contacts.tsx (L470/478) | archive/restore fire silently from dropdown |

**Native `confirm()`/`window.confirm` (off-brand):** TeamManagement L144, ProjectTeam L97, ProjectSettings L1411, Suppliers L449/1233/1308, Trades L484/1290/1365, PurchaseOrders L386, EstimateDetail L5309, HBCFTracker L342, SystemTaskTemplates — **~13 sites**.

**Hand-rolled modal:** SiteDiaryEntries.tsx L1218 builds its own `fixed inset-0 bg-black/50` confirm.

**Good examples to copy:** ArchivedProjects (type-the-name-to-confirm for hard delete), BillDetail, ProjectEstimates, LabourEstimate, BusinessOverheads, Schedule, Tasks, Timesheets, Defects.

**Fix:** shared `<ConfirmDialog>` wrapping `AlertDialog`; adopt at all ~25 sites above.

### 3.2 Empty states

`EmptyState.tsx` exists, is documented as a *"drop-in replacement for the per-page Card + icon + title + button combos"*, and is imported **nowhere**. ~45+ pages hand-roll "No X found" blocks (Tasks has 5 different ad-hoc variants; ProjectScope 7; Messages 9; BillDetail 7; AllowanceDetail 6). Widgets separately standardised on `ui/WidgetEmpty` (36 files) — pages should get the same treatment.

### 3.3 Loading states

Only Budget.tsx (9× `Skeleton`), Personal/BusinessCalendar, ProjectActivity, Messages, and ProjectBoard use skeletons. ~18 financial pages and most core pages branch on `isLoading` with spinners or nothing. **BusinessMetrics.tsx has no loading state at all** despite being data-heavy.

### 3.4 Broken / confusing flows

| Page | Issue | Fix |
|---|---|---|
| `landing.tsx` | "Log In" and both "Get Started" CTAs point to `/api/login` — **dead legacy Replit OIDC endpoint**. Real auth lives at `/auth` | Repoint to `/auth` |
| `AcceptInvitation.tsx` | auto-login-failure fallback also redirects to `/api/login` | `/auth` |
| Password policy | Register requires 8 chars; AcceptInvitation requires 12 + upper/lower/number/symbol | One shared zod schema |
| `onboarding.tsx` | Step 3 (plan) has no Back button (steps 1→2 do) | Add Back |
| `SelectionPortal.tsx` | Client's option choice submits immediately on click, no confirm; comment sends on plain Enter | Lightweight confirm; Shift+Enter convention |
| RFQPortal / ProposalPortal | Irreversible "Submit Quote" / "Accept & Sign" have no confirmation step | Confirm dialog |
| Header vs ProjectSwitcher | Header contains its own project-switching dropdown (L320–485) duplicating ProjectSwitcher — two independent switch UIs | Consolidate |
| Working days | Gantt/Schedule respect `includeSaturday`/`includeSunday` in math, but no UI hint tells the user weekends are excluded | Tooltip/copy near duration fields |
| Dialog buttons | Half of dialogs show `Loader2` spinner while pending, half plain text ("Creating…"); submit labels vary ("Update Category" vs "Save Changes") | One convention |

### 3.5 Mobile responsiveness

| Page/component | Issue | Fix |
|---|---|---|
| `components/Header.tsx` | No `useIsMobile`, no `SidebarTrigger`, no breakpoints — centre cluster (project dropdown + search + tabs) crowds/overflows at 375px | Add trigger + collapse centre cluster |
| `ProposalPortal.tsx` | Estimate & payment `<table>` with fixed `w-20`/`w-28` cols, **no** overflow wrapper — clients on phones get clipped tables | `overflow-x-auto` |
| `CompanyWorkload.tsx` | Workload grid has no overflow container | `overflow-x-auto` |
| `AuthPage.tsx` | Register name fields `grid-cols-2` at 360px | `grid-cols-1 sm:grid-cols-2` |
| `Gantt.tsx` | Fixed px columns (`w-[280px]`…), sidebar doesn't collapse | Responsive/collapsible column |
| EnhancedCalendar / ProjectCalendar | Fixed `grid-cols-7` with no mobile fallback | Agenda/list view under a breakpoint |
| Fixed-width hotspots | BillDetail (8), ClientInvoiceDetail (7), Messages (6), EstimateDetail (5) `w-[NNNpx]` | `min-w-0` + responsive caps |
| `RolesPermissions.tsx` | 1,059-line permission matrix — verify horizontal scroll | `overflow-x-auto` |

---

## 4. Quick wins (10 × under 30 minutes, highest visible impact)

1. **Repoint `landing.tsx` + `AcceptInvitation.tsx` from `/api/login` to `/auth`** — fixes a broken product entry point.
2. **Add `AlertDialog` confirms to the 9 no-confirmation deletes** (7 template list pages + ChecklistTemplates + SiteDiaryTemplates) — direct data-loss risk.
3. **Add a confirm to Contacts archive/restore** (`Contacts.tsx` L470/478).
4. **Delete dead components**: `TaskForm.old.tsx`, `GanttPDFExport.tsx`, `WarmPaletteSwitcher.tsx`, `ProjectList.tsx`, `ProjectOverview.tsx` (+ example), and the `Calendar.tsx`/`ProjectCalendar` stub route (~600+ lines of noise gone).
5. **Swap emerald→sage / red→coral in `ClientInvoiceDetail.tsx`** (~14 spots) — the highest-visibility money screen.
6. **Give `BillDetail.tsx` its amber identity** (header accent; it currently has zero tokens).
7. **Tokenise `TeamManagement.tsx`'s 27 status hexes** (L217–384) → coral/amber/sage.
8. **Replace the `#A890D4` and `#3B82F6` literal fallbacks** in ProjectSettings (×5), FieldSettings (×4), Settings (×5) with `hsl(var(--primary))`.
9. **Wrap `ProposalPortal` tables and `CompanyWorkload` grid in `overflow-x-auto`**; fix AuthPage `grid-cols-1 sm:grid-cols-2` — the client-facing mobile breakages.
10. **Unify the two `getStatusBadge` implementations inside `Estimates.tsx`** (L332 vs L850) and unify the register/invite password schemas.

## 5. Bigger improvements (ranked by impact ÷ effort)

1. **Status system rollout.** Extend `StatusBadge` to accept dynamic field-setting colours, migrate the ~28 pages with local helpers, and convert the repeated `bg-green-100 … dark:bg-green-900/30` idiom to the existing `--status-*` tokens. This single campaign clears the majority of the ~1,130 off-token status classes and fixes light/dark drift in EstimateDetail, PurchaseOrders, ClientInvoiceDetail, RFQDetail, Timesheets.
2. **Config-driven `<TemplateListPage>` + `<TemplateDetailPage>`.** Collapses ~8,000 lines of near-duplicate list code + 7 duplicate detail scaffolds; delete-confirm and empty-state fixes come free in one place.
3. **Widget framework consolidation.** One generic Container + Registry across `widgets/`, `user-workspace/widgets/`, `business-widgets/`; merge the two diverged `PinnedItemsWidget` copies (1,310 lines → one scoped component). Fixes dashboard card-style drift structurally.
4. **`<PortalLayout>` + `<PortalStateBoundary>`.** One branded shell (Morada logo, consistent background/footer) and one loading/error implementation for all 5 client/trade-facing portals — these are the pages *your clients* see.
5. **`<PageHeader>` + `EmptyState` + `Skeleton` adoption app-wide.** Ends the three-way title-scale split, the ~45 hand-rolled empty states, and the ad-hoc loading patterns.
6. **Calendar consolidation.** Standardise on EnhancedCalendar, retire react-big-calendar (fixes the orphaned `schedule-calendar.css` and unstyled TaskCalendar), add an agenda view for mobile.
7. **Dialog/select unification.** Category/CostCode dialog factory (~1,230→~300 lines), fold AssigneeSelect/ProjectSelect/MultiUserSelect into `SearchableSelect`, merge the two Bulk Xero mappers, standardise `<DialogFooter>` + `Loader2` pending states.
8. **Token migration campaign for the top-12 files** (§1.2) plus `index.css`'s own foreign blues, and implement (or formally drop) the 3px left-accent-border convention.
9. **Shared working-day utility** replacing the duplicated logic in Gantt + Schedule, with UI hints for weekend exclusion.
10. **Header mobile pass** — SidebarTrigger, collapsing centre cluster, and removing the duplicate project switcher.

---

*Sources: six parallel audit passes over the full client tree. PDF/react-pdf components excluded from hex counts (CSS variables unavailable there by design). Line numbers are approximate anchors, verified at audit time.*
