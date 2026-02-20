# General System Features - User Stories

## Epic Overview
General System Features covers the foundational cross-cutting concerns that underpin the entire BuildPro platform. This includes user authentication, company onboarding, system-wide settings and configuration, customisable field options, user preferences, and master data management for contacts, cost codes, and trades. These features provide the infrastructure upon which all project-specific modules operate.

## Business Value
A robust and configurable system foundation is essential for Australian residential builders who operate diverse businesses with varying workflows, team structures, and reporting requirements. Flexible authentication supports solo builders and growing teams alike. Customisable field settings ensure the platform adapts to each builder's terminology and processes rather than forcing a one-size-fits-all approach. Centralised contacts, cost codes, and trades management eliminates data duplication across projects and ensures consistency in reporting, estimating, and financial tracking across the entire business.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/Owner | Business Owner | Set up and configure the platform for their building company |
| Admin | Office Administrator | Manage system settings, contacts, cost codes, and user access |
| Builder/PM | Project Manager | Use customised fields and preferences for efficient project management |
| New User | First-time User | Register, onboard, and set up their company profile quickly |
| Team Member | General User | Personalise their experience with column and view preferences |

## User Stories

### US-GN001: Register New Account
**As a** New User, **I want to** register for a BuildPro account using my email and password, **so that** I can start using the platform for my building business.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Registration form with email, password, first name, and last name fields
- [ ] Email validation and duplicate email check
- [ ] Password strength requirements enforced
- [ ] Successful registration creates user account and logs in automatically
- [ ] Registration via POST /api/register endpoint
- [ ] Redirect to onboarding flow after registration

---

### US-GN002: Login with Email and Password
**As a** Builder/Owner, **I want to** log in using my email and password, **so that** I can access my BuildPro account securely.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Login form with email and password fields
- [ ] Validate credentials against stored records
- [ ] Create session on successful authentication
- [ ] Show error message for invalid credentials
- [ ] Login via POST /api/login endpoint
- [ ] Redirect to dashboard after login

---

### US-GN003: Login with Google OAuth
**As a** Builder/Owner, **I want to** log in using my Google account, **so that** I can access BuildPro without remembering another password.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Google OAuth login button on auth page
- [ ] Redirect to Google consent screen
- [ ] Create or link account on successful Google authentication
- [ ] Create session and redirect to dashboard
- [ ] Support both new registration and returning login via Google

---

### US-GN004: Logout
**As a** Builder/Owner, **I want to** log out of my account, **so that** I can secure my session when leaving the platform.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Logout action accessible from user menu
- [ ] Destroy session on logout via POST /api/logout
- [ ] Redirect to login page after logout
- [ ] Clear any cached user data

---

### US-GN005: Get Current User Session
**As a** Builder/Owner, **I want to** have my session persist across page refreshes, **so that** I don't have to log in repeatedly.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] GET /api/user returns current authenticated user data
- [ ] Session persists across browser refreshes
- [ ] Return 401 if no active session
- [ ] Frontend checks session on app initialisation

---

### US-GN006: Complete Onboarding - Profile Setup
**As a** New User, **I want to** complete my profile during onboarding, **so that** my personal details are configured for the platform.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Multi-step onboarding wizard after first registration
- [ ] Profile step: enter/confirm first name, last name, phone number
- [ ] Upload profile picture
- [ ] Save profile details before proceeding to company setup
- [ ] Show progress indicator for onboarding steps

---

### US-GN007: Complete Onboarding - Company Creation
**As a** New User, **I want to** create my company profile during onboarding, **so that** my building business is set up in the system.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Company step: enter company name, ABN, address, phone, email
- [ ] Upload company logo
- [ ] Create company record and associate with user
- [ ] Set up default company settings (date format, week start, etc.)
- [ ] Redirect to dashboard on onboarding completion

---

### US-GN008: Configure Company Date Format
**As an** Admin, **I want to** set the company's preferred date format, **so that** all dates across the platform display consistently.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Date format selector in company settings (e.g. DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- [ ] Selected format applied across all date displays in the platform
- [ ] Stored in companySettings.dateFormat
- [ ] Default to Australian standard (DD/MM/YYYY)
- [ ] Save via PATCH /api/company-settings

---

### US-GN009: Configure Week Start Day
**As an** Admin, **I want to** set the company's week start day, **so that** calendar views and weekly reports align with our business week.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Week start day selector (Monday or Sunday)
- [ ] Applied to calendar components across the platform
- [ ] Stored in companySettings.weekStartDay
- [ ] Default to Monday (Australian business standard)

---

### US-GN010: Configure Working Days
**As an** Admin, **I want to** define which days of the week are working days, **so that** scheduling and calendar features respect our work schedule.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Multi-select for working days (Monday through Sunday)
- [ ] Working days used in schedule calculations and calendar displays
- [ ] Stored in company settings
- [ ] Default to Monday-Friday

---

### US-GN011: Configure Activity Feed Settings
**As an** Admin, **I want to** configure activity feed display settings, **so that** I can control what activity information is shown across the platform.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle settings for various activity feed display options
- [ ] Apply settings company-wide
- [ ] Stored in company settings
- [ ] Save via /api/company-settings endpoint

---

### US-GN012: Customise Field Settings - Dropdown Values
**As an** Admin, **I want to** customise the dropdown values for status, priority, and type fields across features, **so that** the platform terminology matches our business processes.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Manage custom values for field settings (status options, priority levels, type categories)
- [ ] Add new values with label and optional colour
- [ ] Reorder values via drag-and-drop or sort order
- [ ] Delete unused values
- [ ] Apply custom values across all relevant features (tasks, defects, RFIs, etc.)
- [ ] CRUD via /api/field-settings endpoint

---

### US-GN013: View and Edit Field Settings
**As an** Admin, **I want to** view and edit all customisable field settings in one place, **so that** I can maintain consistency across the platform.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Dedicated Field Settings page listing all customisable fields
- [ ] Group fields by feature area (tasks, defects, schedule, etc.)
- [ ] Inline editing of field values
- [ ] Show current values with colour indicators where applicable
- [ ] Accessible from Settings navigation

---

### US-GN014: Save User Column Preferences
**As a** Team Member, **I want to** customise which columns are visible in table views, **so that** I can focus on the information most relevant to my role.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle column visibility on table views
- [ ] Persist column preferences per user per table via /api/user-column-preferences
- [ ] Restore preferences on page load
- [ ] Support resetting to default columns
- [ ] Column preferences are user-specific, not company-wide

---

### US-GN015: Save User View Preferences
**As a** Team Member, **I want to** save my preferred view mode (table, board, calendar, etc.), **so that** each page opens in my preferred layout.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Remember selected view mode per page (e.g. table vs kanban for tasks)
- [ ] Persist via /api/user-view-preferences
- [ ] Restore on next visit to the page
- [ ] User-specific preferences

---

### US-GN016: Manage Contacts
**As an** Admin, **I want to** create, view, edit, and delete contacts, **so that** I have a centralised directory of all people and companies I work with.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create contacts with name, company, email, phone, type (client/subcontractor/supplier/architect/engineer/consultant/other)
- [ ] View contacts in a searchable, sortable list
- [ ] Edit contact details
- [ ] Delete contacts (with dependency check)
- [ ] CRUD via /api/contacts endpoint
- [ ] Contacts unified with suppliers in a single system

---

### US-GN017: Search and Filter Contacts
**As a** Builder/PM, **I want to** search and filter my contacts, **so that** I can quickly find the right person or company.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Text search across contact name, company, email
- [ ] Filter by contact type
- [ ] Sort by name, company, or type
- [ ] Real-time filtering as user types

---

### US-GN018: Manage Cost Codes
**As an** Admin, **I want to** create and manage cost codes, **so that** I have a standardised coding system for estimating and budget tracking.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create cost codes with code number, description, and category
- [ ] View cost codes in a searchable list
- [ ] Edit cost code details
- [ ] Delete cost codes (with dependency check)
- [ ] CRUD via /api/cost-codes endpoint
- [ ] Cost codes available across estimates, variations, and budget features

---

### US-GN019: Merge Duplicate Cost Codes
**As an** Admin, **I want to** merge duplicate cost codes, **so that** I can consolidate codes without losing associated data.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select source and target cost codes for merge
- [ ] Transfer all references from source to target code
- [ ] Delete source cost code after merge
- [ ] Show confirmation with impact summary before merge
- [ ] Maintain data integrity across estimates and budgets

---

### US-GN020: Import Cost Codes
**As an** Admin, **I want to** import cost codes from a spreadsheet, **so that** I can quickly set up my coding system from an existing template.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Upload CSV or Excel file with cost code data
- [ ] Map spreadsheet columns to cost code fields
- [ ] Preview imported data before confirmation
- [ ] Handle duplicate detection during import
- [ ] Show import results summary

---

### US-GN021: Manage Trades
**As an** Admin, **I want to** create and manage trade categories, **so that** I can classify subcontractors and work by trade type.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create trades with name and optional description
- [ ] View trades in a list
- [ ] Edit trade details
- [ ] Delete trades (with dependency check)
- [ ] CRUD via /api/trades endpoint
- [ ] Trades available for subcontractor classification and defect assignment

---

### US-GN022: View Company Settings
**As an** Admin, **I want to** view all company settings in one place, **so that** I can review and manage the company's platform configuration.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Settings page with sections for company profile, date/time, working days, and activity
- [ ] Display current values for all settings
- [ ] Navigate to individual setting sections for editing
- [ ] Accessible from main navigation

---

### US-GN023: System Configuration Management
**As an** Admin, **I want to** access system-level configuration, **so that** I can manage advanced platform settings.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] System Configuration page accessible from admin navigation
- [ ] View and edit system-level configuration parameters
- [ ] Changes applied system-wide
- [ ] Restricted to admin users

---

### US-GN024: Merge Duplicate Contacts
**As an** Admin, **I want to** merge duplicate contacts, **so that** I can consolidate contact records without losing associated project data.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select source and target contacts for merge
- [ ] Transfer all references from source to target contact
- [ ] Delete source contact after merge
- [ ] Show confirmation with impact summary before merge
- [ ] Maintain data integrity across projects, RFIs, and other linked records

---

## Technical Notes
- Authentication supports dual mode: email/password and Google OAuth
- Session management via server-side sessions with cookie-based authentication
- Onboarding flow is multi-step: profile setup → company creation
- Company settings stored in companySettings table with fields: dateFormat, weekStartDay, working day flags, activity feed toggle fields
- Field settings stored in fieldSettings table, enabling customisable dropdown values across all features
- User column preferences stored in userColumnPreferences table (per user, per page/table)
- User view preferences stored in userViewPreferences table (per user, per page)
- Contacts system is unified with suppliers (contacts table serves both purposes)
- Cost codes support hierarchical categories and are referenced by estimates, variations, and budgets
- Trades used for subcontractor classification, defect assignment, and work categorisation
- Frontend components: AuthPage.tsx (auth), onboarding.tsx (setup), Settings.tsx (company settings), FieldSettings.tsx (field customisation), Contacts.tsx, CostCodes.tsx, Trades.tsx, SystemConfiguration.tsx

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/register | Register new user account |
| POST | /api/login | Login with email/password |
| POST | /api/logout | Logout and destroy session |
| GET | /api/user | Get current authenticated user |
| GET | /api/company-settings | Get company settings |
| PATCH | /api/company-settings | Update company settings |
| GET | /api/field-settings | Get all field settings |
| POST | /api/field-settings | Create a field setting |
| PATCH | /api/field-settings/:id | Update a field setting |
| DELETE | /api/field-settings/:id | Delete a field setting |
| GET | /api/user-column-preferences | Get user column preferences |
| POST | /api/user-column-preferences | Save user column preferences |
| GET | /api/user-view-preferences | Get user view preferences |
| POST | /api/user-view-preferences | Save user view preferences |
| GET | /api/contacts | List all contacts |
| POST | /api/contacts | Create a new contact |
| GET | /api/contacts/:id | Get a single contact |
| PATCH | /api/contacts/:id | Update a contact |
| DELETE | /api/contacts/:id | Delete a contact |
| GET | /api/cost-codes | List all cost codes |
| POST | /api/cost-codes | Create a new cost code |
| PATCH | /api/cost-codes/:id | Update a cost code |
| DELETE | /api/cost-codes/:id | Delete a cost code |
| GET | /api/trades | List all trades |
| POST | /api/trades | Create a new trade |
| PATCH | /api/trades/:id | Update a trade |
| DELETE | /api/trades/:id | Delete a trade |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /auth | AuthPage.tsx | Login and registration page |
| /onboarding | onboarding.tsx | Multi-step onboarding wizard |
| /settings | Settings.tsx | Company settings management |
| /settings/fields | FieldSettings.tsx | Field settings customisation |
| /contacts | Contacts.tsx | Contacts directory management |
| /cost-codes | CostCodes.tsx | Cost codes management |
| /trades | Trades.tsx | Trades management |
| /system-configuration | SystemConfiguration.tsx | System-level configuration |

## Known Issues / Future Enhancements
- [ ] No two-factor authentication (2FA) support
- [ ] No SSO integration beyond Google OAuth (e.g. Microsoft, Apple)
- [ ] No password reset / forgot password flow documented
- [ ] No role-based access control granularity beyond admin/user
- [ ] No audit log for settings changes
- [ ] No bulk import for contacts from external CRM systems
- [ ] No cost code templates for common Australian building categories (e.g. ABIC, MBA)
- [ ] No automated contact deduplication suggestions
- [ ] No API rate limiting configuration

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 24
- Implemented: 24
- Partially Implemented: 0
- Not Implemented: 0
