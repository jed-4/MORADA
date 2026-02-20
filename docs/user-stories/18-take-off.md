# BuildPro User Stories: Take-off (Quantity Take-offs & Labour Hours)

## Epic Overview

### Description
The Take-off system enables builders to perform quantity take-offs from construction plans and estimate labour hours for project tasks. It provides tools for measuring areas, volumes, lengths, and counts from digital plans, and links these measurements to cost codes and estimate line items for accurate project costing.

### Business Value
- Eliminates manual measurement errors by providing digital take-off tools linked directly to estimates
- Streamlines labour hour estimation with trade-specific productivity rates for Australian residential construction
- Reduces estimating time by allowing direct import from plans and export to estimate line items
- Provides a single source of truth for quantities that feeds into budgets, purchase orders, and scheduling

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Estimator** | Dedicated costing role | Accurate quantity measurements, labour hour calculations, cost code linking |
| **Builder/Owner** | Business owner, manages projects | Overview of quantities and labour budgets, cost control |
| **Project Manager** | Manages specific projects | Review take-off data, link to estimates and schedules |
| **Site Supervisor** | On-site team lead | Verify quantities on-site, track labour hours against estimates |

---

## User Stories

### 1. Quantity Measurements

#### US-TO001: Create a Quantity Measurement
**As an** estimator
**I want to** create a new quantity measurement entry for a project
**So that** I can record material quantities from construction plans

**Acceptance Criteria:**
- [ ] User can add a measurement from the Measurements tab
- [ ] Measurement includes: name, description, measurement type (length, area, volume, count)
- [ ] Measurement is linked to a project
- [ ] User can assign a cost code to the measurement
- [ ] Measurement entry displays in the Measurements list

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO002: Calculate Area Measurements
**As an** estimator
**I want to** calculate area measurements (m²) from plan dimensions
**So that** I can accurately quantity flooring, painting, tiling, and roofing areas

**Acceptance Criteria:**
- [ ] User can enter length and width to calculate area (m²)
- [ ] Support for rectangular, triangular, and irregular shapes
- [ ] Deduction entries for openings (doors, windows) subtracted from totals
- [ ] Running total displayed as measurements are added
- [ ] Multiple area measurements can be grouped under a single take-off item

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO003: Calculate Volume Measurements
**As an** estimator
**I want to** calculate volume measurements (m³) from plan dimensions
**So that** I can accurately quantity concrete, excavation, and fill requirements

**Acceptance Criteria:**
- [ ] User can enter length, width, and depth to calculate volume (m³)
- [ ] Support for concrete slabs, footings, and excavation volumes
- [ ] Wastage factor percentage applied to calculated volumes
- [ ] Conversion display (e.g., m³ to cubic yards where needed)
- [ ] Running total displayed as measurements are added

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO004: Calculate Linear Measurements
**As an** estimator
**I want to** calculate linear measurements (m, lm) from plan dimensions
**So that** I can accurately quantity fencing, piping, wiring, and trim

**Acceptance Criteria:**
- [ ] User can enter individual lengths to sum linear metres
- [ ] Support for perimeter calculations from room dimensions
- [ ] Wastage factor percentage applied to calculated lengths
- [ ] Running total displayed as measurements are added

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO005: Count-Based Measurements
**As an** estimator
**I want to** record count-based measurements (each, units)
**So that** I can quantity items like fixtures, fittings, power points, and windows

**Acceptance Criteria:**
- [ ] User can enter a count with description
- [ ] Support for different unit types (each, set, pair, lot)
- [ ] Grouping by location or room
- [ ] Running total displayed

**Priority:** Must Have
**Status:** Not Implemented

---

### 2. Labour Hours

#### US-TO006: Add Labour Hour Estimate
**As an** estimator
**I want to** add labour hour estimates for project tasks
**So that** I can budget labour costs and plan scheduling

**Acceptance Criteria:**
- [ ] User can add a labour entry from the Labour Hours tab
- [ ] Labour entry includes: trade/task description, hours, rate per hour, number of workers
- [ ] Total labour cost auto-calculated (hours x rate x workers)
- [ ] Labour entry can be assigned a cost code
- [ ] Labour entry can be linked to a schedule item

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO007: Trade-Specific Labour Rates
**As a** builder/owner
**I want to** set default labour rates per trade
**So that** estimators can quickly apply standard rates for Australian trades

**Acceptance Criteria:**
- [ ] Default labour rate library with common Australian building trades
- [ ] Rates include: carpenter, electrician, plumber, plasterer, tiler, painter, labourer, etc.
- [ ] Company-level customisation of default rates
- [ ] Rates auto-populate when a trade is selected on a labour entry
- [ ] Support for different rate types (hourly, daily, per-unit)

**Priority:** Should Have
**Status:** Not Implemented

---

#### US-TO008: Labour Productivity Rates
**As an** estimator
**I want to** apply productivity rates to calculate labour hours from quantities
**So that** I can estimate how long tasks will take based on measurement quantities

**Acceptance Criteria:**
- [ ] Productivity rate field (e.g., m² per hour, items per hour)
- [ ] Auto-calculation of hours from linked measurement quantity and productivity rate
- [ ] Productivity rate library for common tasks (e.g., bricklaying: 40 bricks/hr)
- [ ] Labour hours update when linked measurement quantities change

**Priority:** Should Have
**Status:** Not Implemented

---

### 3. Integration & Export

#### US-TO009: Link Take-off to Cost Codes
**As an** estimator
**I want to** link take-off measurements and labour entries to cost codes
**So that** quantities feed into the budget tracking system

**Acceptance Criteria:**
- [ ] Searchable cost code selector on each measurement and labour entry
- [ ] Cost code totals aggregate all linked measurements
- [ ] Cost code assignment is required before export to estimates
- [ ] Multiple measurements can share the same cost code

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO010: Export Take-off to Estimate
**As an** estimator
**I want to** export take-off quantities and labour hours to an estimate
**So that** measured quantities populate estimate line items automatically

**Acceptance Criteria:**
- [ ] Export button sends selected measurements to an estimate
- [ ] User selects target estimate and group
- [ ] Quantities, units, and cost codes mapped to estimate item fields
- [ ] Labour hours exported as Labour-type estimate items
- [ ] Duplicate detection warns if items already exist in the target estimate

**Priority:** Must Have
**Status:** Not Implemented

---

#### US-TO011: Import Measurements from Plans
**As an** estimator
**I want to** import measurements from digital plan files (PDF)
**So that** I can take off quantities directly from uploaded drawings

**Acceptance Criteria:**
- [ ] Upload PDF plan files to the take-off module
- [ ] Set scale on the plan (e.g., 1:100)
- [ ] On-screen measurement tools for length, area, and count
- [ ] Measurements saved and linked to take-off entries
- [ ] Pan, zoom, and navigate multi-page plan sets

**Priority:** Could Have
**Status:** Not Implemented

---

#### US-TO012: Take-off Summary View
**As a** project manager
**I want to** view a summary of all take-off measurements and labour hours
**So that** I can review quantities before they are exported to estimates

**Acceptance Criteria:**
- [ ] Summary view showing all measurements grouped by cost code
- [ ] Total quantities per measurement type (area, volume, length, count)
- [ ] Total labour hours and estimated labour cost
- [ ] Filter by trade, cost code, or measurement type
- [ ] Print/export summary as PDF or CSV

**Priority:** Should Have
**Status:** Not Implemented

---

## Technical Notes

### Data Model
- Take-off module is currently **placeholder UI only** — no backend schema or API routes exist
- Frontend component `Takeoff.tsx` (104 lines) renders two tabs: Measurements and Labour Hours
- Both tabs show empty state UI with "Add Measurement" and "Add Labour Entry" buttons respectively
- No database tables have been created for take-off data
- Future implementation will require:
  - `takeoffMeasurements` table: projectId, name, description, measurementType, quantity, unit, wastagePercent, costCodeId, dimensions (JSON), groupName, location
  - `takeoffLabourEntries` table: projectId, tradeDescription, hours, rate, workers, totalCost, costCodeId, scheduleItemId, productivityRate
  - Financial values should be stored in cents (integer) consistent with the rest of BuildPro

### API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| — | — | No API routes exist yet |

*Planned routes:*
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/takeoff-measurements` | List measurements (filter: projectId) |
| POST | `/api/takeoff-measurements` | Create measurement |
| PATCH | `/api/takeoff-measurements/:id` | Update measurement |
| DELETE | `/api/takeoff-measurements/:id` | Delete measurement |
| GET | `/api/takeoff-labour` | List labour entries (filter: projectId) |
| POST | `/api/takeoff-labour` | Create labour entry |
| PATCH | `/api/takeoff-labour/:id` | Update labour entry |
| DELETE | `/api/takeoff-labour/:id` | Delete labour entry |
| POST | `/api/takeoff/export-to-estimate` | Export take-off data to estimate |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/projects/:projectId/takeoff` | Takeoff | Project-level take-off page (placeholder UI) |

---

## Known Issues / Future Enhancements

- [ ] Entire module is placeholder UI only — no backend implementation exists
- [ ] Plan viewer with on-screen measurement tools (PDF overlay) is a significant feature requiring a specialised library
- [ ] Integration with BIM/CAD file formats for automated quantity extraction
- [ ] Revision tracking for take-off measurements when plans are updated
- [ ] Multi-user concurrent editing of take-off data
- [ ] Mobile-friendly take-off entry for on-site verification
- [ ] Historical productivity rate tracking based on actual project data

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

---

## Implementation Coverage Summary

| Area | Stories | Implemented | Partial | Not Started |
|------|---------|-------------|---------|-------------|
| Quantity Measurements | 5 | 0 | 0 | 5 |
| Labour Hours | 3 | 0 | 0 | 3 |
| Integration & Export | 4 | 0 | 0 | 4 |
| **Total** | **12** | **0** | **0** | **12** |

- Total Stories: 12
- Implemented: 0
- Partially Implemented: 0
- Not Implemented: 12
