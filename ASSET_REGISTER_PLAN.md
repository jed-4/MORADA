# Asset Register: plan

Branch `feat/asset-register`, worktree `morada-asset-register`, cut from `origin/main` 40ac5c0c (2026-10-26).
Status: **research and design only. No code written yet.**

---

## 1. Why build this

- **Competitors.**
  - None of the Australian residential-builder tools has a real vehicle register: not Buildxact, Databuild, Tradify, Fergus, or Buildertrend (its version is tags plus tasks).
  - The tools that do this well are field-service ERPs (Simpro, AroFlo), fleet apps (Fleetio, Whip Around) and telematics (Samsara, Teletrac, EROAD).
  - None of those does job costing for a builder.
- **What Morada has that they don't.** Morada already holds the money side:
  - Xero bills, timesheets, project cost codes, overheads and the cashflow forecast.
  - A vehicle register sitting on top of that can answer questions a standalone fleet app can't. For example: what does the tipper really cost a year, and how much of that do we recover from jobs?

## 2. Competitor snapshot

| Product | Strong at | Weak / missing | Price |
|---|---|---|---|
| Fleetio | Rich vehicle record; service due on **km OR date, whichever comes first**; renewal reminders | Fuel-card integration is US/Canada only; no job costing | ~US$4–10 per vehicle/month, 5 vehicles minimum |
| Whip Around | Mobile pre-starts and defect workflow (AI photo checks) | Shallow cost side | Free basic; ~US$5–10 per asset/month |
| Simpro | Built-in GPS (Simtrac) feeds odometer; site time becomes job hours | Pre-starts need a marketplace add-on; quote-only, heavy | Quote |
| AroFlo | Date- **and** odometer-based servicing; asset documents | No real job recharge | From A$39 per user/month |
| Procore Equipment | **Hours × rate charged to a cost code** | No maintenance work orders; rate tables are beta | Quote |
| Teletrac / EROAD / Samsara | Live odometer, engine hours, GPS | Hardware cost; APIs gated, except Samsara | ~A$25–35 per vehicle/month plus hardware |
| Xero Fixed Assets | Depreciation | Nothing operational | Included in Xero |

**Table stakes** (every serious tool has these):
- An asset record and a document vault.
- Expiry dates with reminders.
- Service schedules based on km or date.
- An assigned driver, with history.
- A mobile pre-start check that can flag a defect and mark the vehicle "do not use".
- Fuel and service history.
- Odometer readings.

**Differentiators:**
- Charging asset costs to jobs.
- Total cost of ownership and cost per km.
- An FBT logbook.
- QR tags on vehicles.
- Automatic meter readings from telematics.

## 3. Australian rules the design has to respect

- **Rego.**
  - Every state needs an expiry date and a term of 3, 6 or 12 months.
  - In **NSW the green slip (CTP) is separate** and must be renewed before rego.
  - NSW light vehicles more than 5 years old need a **pink slip** before renewal.
  - In QLD and VIC, CTP is included in rego.
- **No free government API for rego status** in NSW, QLD or VIC. Expiry is entered by hand, or read off the renewal bill.
  - The only official API is the **NHVR Portal API**, and it covers heavy vehicles only.
- **Heavy vehicles over 4.5t GVM.**
  - The NHVR has named builders as Chain of Responsibility parties.
  - That means a daily safety check (brakes, lights, mirrors and wipers, body, engine and exhaust), maintenance to the national inspection manual (NHVIM), and no use until defects are fixed.
  - **If the tipper is over 4.5t GVM, this applies to Lighthouse.**
- **WHS.** Pre-start checks on mobile plant, with defects fixed before use, are standard practice under the *Managing the Risks of Plant* Code of Practice.
- **FBT.**
  - The work-ute exemption needs private use to be "minor, infrequent and irregular", and **the ATO is auditing these claims**.
  - The ATO logbook method needs 12 continuous weeks recording each trip's purpose and start and end odometer.
- **Instant asset write-off** is reportedly A$20k and now permanent. **Check the ATO page before showing this in the UI.** It matters most for trailers and tools, because utes usually cost more than A$20k.

## 4. Fuel and telematics data reality

- **Fuel cards.**
  - FleetCard has no public API, only a daily feed to telematics partners.
  - I found no public API for WEX Motorpass.
  - Shell has APIs, but I couldn't confirm they work in Australia.
  - → **The practical source of fuel data is the monthly fuel-card bill that already syncs from Xero.**
- **Telematics.** Samsara has a public API. Teletrac and EROAD give API access on request or on premium plans only. Treat telematics as a later, per-customer add-on.
  - In v1, odometer readings come from pre-starts.

## 5. What Morada already has (reuse, don't rebuild)

| Need | Existing piece |
|---|---|
| Company scoping | `companyId` FK + `.omit({companyId})`; `makeOwnedByCompany` in `server/middleware/tenantGuards.ts`; `npm run check:tenancy` enforces |
| Permissions | `ensureBuiltInPermissionsExist()` `server/storage.ts:7162` (+ MemStorage list `:1934`); role defaults `getDefaultActionsForRole()` `:1727`; existing-role backfill pattern `backfillClientPortalAccessGrants` `:7330` |
| Expiry reminders | `processInsuranceExpiryReminders()` `server/utils/reminderProcessor.ts:288`: daily 30/7-day pass with sent-flags. An asset pass slots in next to it (`:207-211`) |
| Calendar | Add an `assets` layer: `shared/businessCalendarLayers.ts` + a query block in `GET /api/business-calendar/events` (`server/routes.ts:35916`) |
| Dashboard | `businessWidgetRegistry` in `client/src/components/dashboard/DashboardWidgetRegistry.tsx:508` |
| Page placement | New Business tab `/business/assets` in `client/src/pages/businessTabs.ts` + `Business.tsx` (same pattern as Overheads and Cashflow) |
| Uploads | `/api/uploads/request-url` → `/objects/company/<id>/…`; per-entity attachments table like `purchaseOrderAttachments` (`shared/schema.ts:6387`) |
| Bills | `billLineItems` (`shared/schema.ts:2250`) has no asset link. Add a nullable `assetId` |
| Cashflow | `businessExpenses` (`shared/schema.ts:8070`) dated register. Rego/insurance/finance become rows with `source: 'asset'`. There is already a `vehicle` what-if engine (`shared/cashflow/whatifs.ts:237`) |
| Mobile | `expo-mobile/`: new screens in `AppNavigator.tsx`, tile in `components/more/items.ts`, offline queue, `ReceiptCaptureScreen` as the photo-and-upload model |
| Migrations | Hand-written SQL; next number **0111** (two 0110s exist); idempotent; `npm run check:schema` |

**Gotchas:**
- `checklistInstances.projectId` is NOT NULL, so pre-starts get their own table rather than reusing checklists.
- `timesheets` has no `companyId`.
- Xero tracking slots are full: TC1 is the cost code and TC2 is the project. A vehicle can't become a third Xero tracking category.

## 6. Proposed data model (v1)

```
assets
  id, companyId, assetType ('vehicle'|'trailer'|'plant'|'tool'), name, status ('active'|'off_road'|'sold'|'archived')
  make, model, year, vin, rego, regoState, gvmKg, isHeavyVehicle (derived gvm>4500), colour, photoUrl
  assignedUserId, purchaseDate, purchaseCents, financeProvider, financeEndDate
  meterType ('km'|'hours'), currentMeter, currentMeterAt
  internalRateCents, internalRateUnit ('day'|'hour'|'km')   -- used in v2
  notes, createdAt, updatedAt

asset_compliance_items          -- one row per expiring thing
  id, companyId, assetId, kind ('rego'|'ctp'|'insurance'|'safety_check'|'nhvr'|'test_tag'|'custom')
  label, provider, policyNumber, expiryDate (text YYYY-MM-DD), termMonths, amountCents
  documentUrl, reminder30Sent, reminder7Sent

asset_service_schedules
  id, assetId, label ('Minor service'), everyKm|everyHours, everyMonths, lastDoneMeter, lastDoneDate
  → due = whichever comes first

asset_events                    -- the history log: services, repairs, meter readings, assignments, defects
  id, companyId, assetId, kind, date, meter, costCents, billId?, userId, description, attachments json

asset_prestarts
  id, companyId, assetId, userId, at, meter, templateKey ('light'|'heavy'), results json, photos json,
  signature, hasDefect, defectStatus ('open'|'fixed'), projectId?

asset_assignments               -- who had it, when
  id, assetId, userId, fromDate, toDate

bill_line_items.asset_id (nullable)
```

## 7. Phasing

**PR 1. Register (web).**
- Schema and migration 0111.
- Permission key `business.assets` (view/add/edit/delete).
- A `/business/assets` list and detail page: details, compliance, service, documents, history tabs.
- Archiving instead of deletion.

**PR 2. Due dates.**
- A daily reminder pass for compliance items and services due (km or date).
- An Assets calendar layer.
- A "Fleet due soon" dashboard widget.

**PR 3. Mobile pre-start.**
- An Expo screen built from a QR deep link or the vehicle list.
- Light and heavy checklist templates; the heavy one matches the NHVR daily-check minimums.
- The check records the odometer and takes photos.
- A defect opens a task, notifies the admin and marks the vehicle off-road.
- Permission key `assets.prestart`.

**PR 4. Bill → asset linking (the headline differentiator).**
- An "Asset" column on bill lines.
- Auto-suggest the asset when the rego appears in the description or the supplier is a known vehicle supplier.
- A cost-per-vehicle roll-up and total cost of ownership on the asset page.

**PR 5. Recharge to jobs (v2).**
- An internal day/hour/km rate per asset.
- Timesheets get an optional "vehicle used" field, or a person's assigned vehicle applies automatically on site days.
- The charge posts to the project's cost code alongside labour costs.
- An overheads view shows recovery: amount recharged ÷ actual vehicle cost from bills.

**PR 6. Cashflow feed.** Compliance and finance items generate `businessExpenses` rows, so rego and insurance show up in the forecast.

**Later:**
- FBT 12-week logbook mode (trips prefilled from timesheet sites).
- Push to Xero Fixed Assets when a vehicle purchase bill is approved.
- Samsara telematics.
- Tool check-in/out by QR.

## 8. Open questions for Jed

1. How many vehicles and trailers does Lighthouse run, and what is the **tipper's GVM** (decides NHVR)?
2. Which fuel card (FleetCard, Motorpass, Shell, Ampol)? Does the statement arrive in Xero as one bill or one per card?
3. Should vehicles charge to jobs (PR 5)? If yes, at a flat day rate, or per km?
4. Is anyone taking utes home or using them privately on weekends? That decides whether the FBT logbook moves up the list.
5. Is v1 Lighthouse-only, or a sellable module (feature flag or plan tier)?
6. Should plant and small tools come in at the same time, or after vehicles are proven?
