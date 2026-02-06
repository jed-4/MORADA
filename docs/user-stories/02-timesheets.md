# BuildPro User Stories: Timesheets

## Epic Overview

### Description
The Timesheets system enables time tracking for labour hours across projects. Team members can clock in/out, log time entries, and managers can review and approve submitted timesheets. The system integrates with cost codes for accurate labour cost allocation and supports multiple views for efficient time management.

### Business Value
- Accurate tracking of labour hours per project
- Cost allocation via cost codes for financial reporting
- Approval workflow ensures time entries are reviewed before billing
- Integration with invoicing for Cost Plus billing scenarios
- Real-time clock-in/out for field workers

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner | Overview of all labour costs, approval of timesheets, profitability tracking |
| **Project Manager** | Manages specific projects | Track project labour hours, approve team timesheets, budget monitoring |
| **Site Supervisor** | On-site team lead | Clock in/out team, log daily hours, manage breaks |
| **Field Worker** | On-site labour | Quick clock in/out, log own hours, view submitted entries |
| **Office Admin** | Administrative support | Review timesheets, export data, manage corrections |

---

## User Stories

### 1. Time Entry

#### US-TS001: Create a Timesheet Entry
**As a** team member  
**I want to** log my hours for a specific project and date  
**So that** my time is recorded for billing and payroll purposes

**Acceptance Criteria:**
- [x] User can create a timesheet entry from the Timesheets page
- [x] User can create a timesheet from global header "New" menu
- [x] Entry requires: project, user, date, cost code
- [x] All time entries show: start time, end time, break, duration fields together
- [x] Bi-directional time calculation: filling start+end auto-calculates duration (minus break)
- [x] Bi-directional time calculation: filling start+duration auto-calculates end time
- [x] Optional fields: break duration, description, hourly rate, labels
- [x] Entry is saved and appears in the timesheets list
- [x] Default status is "Submitted" (simplified flow - no separate submission step)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS002: Clock In/Out
**As a** field worker  
**I want to** quickly clock in when I start work and clock out when I finish  
**So that** my hours are accurately recorded without manual entry

**Acceptance Criteria:**
- [x] "Clock In" button available on Timesheets page (green button with popover)
- [x] Clock in creates a timesheet with current timestamp
- [x] Active clock-in shows running timer with elapsed time display
- [x] Clock out records end time and calculates duration (red Stop button)
- [x] Break duration can be recorded (hours field)
- [x] Break start/end times can be recorded (auto-calculates break duration)
- [x] Clock-in widget available on dashboard header

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS003: Edit Timesheet Entry
**As a** team member  
**I want to** edit my timesheet entries before submission  
**So that** I can correct mistakes or add details

**Acceptance Criteria:**
- [x] User can edit submitted timesheet entries
- [x] All fields can be modified
- [x] Changes are saved immediately
- [x] Approved entries cannot be edited (or require re-approval)
- [x] Permission-based editing: users can edit their own timesheets
- [x] Admins/owners/managers can edit all timesheets
- [x] View-only mode shown for users without edit permission

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS004: Delete Timesheet Entry
**As a** team member  
**I want to** delete incorrect timesheet entries  
**So that** I can remove mistakes before submission

**Acceptance Criteria:**
- [ ] User can delete submitted timesheet entries
- [ ] Confirmation required before deletion
- [ ] Approved entries cannot be deleted (or require manager action)
- [ ] Delete action respects permissions (`timesheets.delete_own` or `timesheets.delete_all`)
- [ ] Delete button hidden/disabled when user lacks permission

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS005: Split Time Across Cost Codes
**As a** site supervisor  
**I want to** split a day's hours across multiple cost codes  
**So that** time is accurately allocated to different work types

**Acceptance Criteria:**
- [ ] Option to split timesheet entry across multiple cost codes
- [ ] Each split has its own duration and rate
- [ ] Total hours across splits equals total entry hours
- [ ] Split breakdown saved and displayed

**Priority:** Should Have  
**Status:** Implemented

---

### 2. Timesheet Views

#### US-TS010: View Timesheets in Table Format
**As a** manager  
**I want to** view all timesheets in a detailed table  
**So that** I can review and manage time entries

**Acceptance Criteria:**
- [ ] Table displays: date, user, project, cost code, start time, end time, break, hours, rate, total, status, description
- [ ] Start time and end time shown as separate columns
- [ ] Columns are configurable (show/hide)
- [ ] Columns are resizable
- [ ] Columns support drag-and-drop reordering (matching Tasks table)
- [ ] Rows support drag-and-drop reordering
- [ ] Table supports sorting and filtering
- [ ] Clicking an entry opens the edit dialog
- [ ] Column order and visibility preferences saved per user

**Priority:** Must Have  
**Status:** Partially Implemented (separate time columns and drag-drop pending)

---

#### US-TS011: View Timesheets in Weekly Format
**As a** team member  
**I want to** view my timesheets in a weekly grid  
**So that** I can see my hours at a glance for the week

**Acceptance Criteria:**
- [ ] Weekly view shows days as columns
- [ ] Users shown as rows
- [ ] Hours displayed per day/user
- [ ] Week navigation (previous/next)
- [ ] Click on cell to add/edit entry

**Priority:** Should Have  
**Status:** Implemented

---

#### US-TS012: View Timesheets in Calendar Format
**As a** team member  
**I want to** view my timesheets on a calendar  
**So that** I can see when I worked and for how long

**Acceptance Criteria:**
- [ ] Calendar shows entries on their dates
- [ ] Month/week navigation
- [ ] Entries show hours and project
- [ ] Click to view/edit entry

**Priority:** Should Have  
**Status:** Implemented

---

### 3. Filtering & Search

#### US-TS020: Filter Timesheets
**As a** manager  
**I want to** filter timesheets by various criteria  
**So that** I can find specific entries quickly

**Acceptance Criteria:**
- [ ] Filter by project
- [ ] Filter by user
- [ ] Filter by status (submitted, approved, rejected)
- [ ] Filter by date range (this week, last week, this month, custom)
- [ ] "This week" and "Last week" respect company week start setting (Monday or Sunday)
- [ ] Filter by invoiced status
- [ ] Multiple filters can be combined
- [ ] Active filters shown as badges

**Implementation Note:** Week start preference (Monday/Sunday) should be configurable in Company Settings and applied consistently across all calendars and date-based features throughout the app.

**Priority:** Must Have  
**Status:** Implemented (week start preference pending)

---

#### US-TS021: Search Timesheets
**As a** manager  
**I want to** search timesheets by description  
**So that** I can find entries related to specific work

**Acceptance Criteria:**
- [x] Search box filters by description text
- [x] Real-time filtering as user types

**Priority:** Should Have  
**Status:** Implemented

---

### 4. Approval Workflow

#### US-TS030: Simplified Timesheet Submission
**As a** team member  
**I want** my timesheet entries to be automatically submitted when created  
**So that** my manager can review and approve my hours without an extra submission step

**Acceptance Criteria:**
- [x] New timesheets are created with "Submitted" status (no separate submission step)
- [x] Flow is Submitted -> Approved/Rejected
- [x] "Draft" status removed from UI - all new entries are immediately "Submitted"

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS031: Approve Timesheet (Permission-Based)
**As a** manager with approval permission  
**I want to** approve submitted timesheets  
**So that** hours are confirmed for billing and payroll

**Acceptance Criteria:**
- [x] Approve button available for submitted entries (only for users with timesheets.approve permission)
- [x] Status changes from "Submitted" to "Approved"
- [x] Server-side permission check on approve endpoint (403 if no permission)
- [ ] Approved hours update project labour totals
- [ ] Approval is logged with timestamp and user

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS032: Reject Timesheet (Permission-Based)
**As a** manager with approval permission  
**I want to** reject incorrect timesheets  
**So that** team members can correct and resubmit

**Acceptance Criteria:**
- [x] Reject button available for submitted entries (only for users with timesheets.approve permission)
- [x] Status changes from "Submitted" to "Rejected"
- [x] Server-side permission check on reject endpoint (403 if no permission)
- [ ] Optional rejection reason/comment
- [ ] Team member notified of rejection

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS033: Rapid Approval (Permission-Based)
**As a** manager with approval permission  
**I want to** quickly approve multiple timesheets at once  
**So that** I can efficiently process pending approvals

**Acceptance Criteria:**
- [x] "Rapid Approval" button shows count of pending entries (only visible with timesheets.approve permission)
- [x] Modal displays all pending timesheets with navigation (prev/next)
- [x] Individual approve/reject per entry with inline editing
- [x] "Approve All" option for batch processing
- [x] Batch approval processes all pending entries at once

**Priority:** Should Have  
**Status:** Implemented

---

### 5. Project Context

#### US-TS040: View Project Timesheets
**As a** project manager  
**I want to** view timesheets for a specific project  
**So that** I can track labour hours against the project budget

**Acceptance Criteria:**
- [ ] Timesheets page accessible from project navigation
- [ ] Shows only entries for that project
- [ ] Same functionality as global timesheets view
- [ ] Project name shown in header

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS041: Labour Hours Budget Tracking
**As a** project manager  
**I want to** see how timesheet hours compare to budgeted labour  
**So that** I can monitor project profitability

**Acceptance Criteria:**
- [x] Project shows pending hours (unapproved)
- [x] Project shows approved hours
- [x] Comparison to estimated labour hours (budgeted vs actual with variance)
- [x] Warning when approaching or exceeding budget (red colour coding + progress bars)

**Priority:** Should Have  
**Status:** Implemented

---

### 6. Cost Code Integration

#### US-TS050: Assign Cost Code to Timesheet
**As a** site supervisor  
**I want to** assign a cost code to my timesheet entry  
**So that** labour hours are categorized correctly for reporting and linked to the budget

**Acceptance Criteria:**
- [x] Cost code is required for all timesheet entries
- [x] Cost code dropdown in timesheet entry form
- [x] Option to split time across multiple cost codes
- [x] Cost code displayed in timesheet table
- [x] Timesheet hours roll up to budget via cost code
- [ ] Filter by cost code available

**Priority:** Must Have  
**Status:** Implemented

**Note:** Timesheets link to budget labour hours through cost codes. When time is logged with a cost code, those hours automatically appear in the budget tracking for that cost code.

---

### 7. Rates & Totals

#### US-TS060: Set Hourly Rate
**As a** manager  
**I want to** set the hourly rate for a timesheet entry  
**So that** labour costs are calculated correctly

**Acceptance Criteria:**
- [ ] Hourly rate field in timesheet form
- [ ] Default rate from user profile or company settings
- [ ] Rate can be overridden per entry
- [ ] Total = duration × hourly rate

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS061: View Timesheet Totals
**As a** manager  
**I want to** see total hours and costs  
**So that** I can understand labour expenditure

**Acceptance Criteria:**
- [ ] Total hours shown for filtered results
- [ ] Total cost shown for filtered results
- [ ] Summary by user/project available

**Priority:** Should Have  
**Status:** Partial

---

### 8. Export & Reporting

#### US-TS070: Export Timesheets
**As a** office admin  
**I want to** export timesheets to Excel  
**So that** I can use the data for payroll or external reporting

**Acceptance Criteria:**
- [x] Export button on Timesheets page
- [x] Exports currently filtered entries
- [x] Excel format with columns: Date, User, Project, Start Time, End Time, Break, Duration, Hourly Rate, Total, Status, Invoiced, Description
- [x] Filename includes project name (if filtered) and date

**Priority:** Should Have  
**Status:** Implemented

---

### 9. Invoicing Integration

#### US-TS080: Mark Timesheet as Invoiced
**As a** office admin  
**I want to** mark timesheets as invoiced  
**So that** I know which entries have been billed

**Acceptance Criteria:**
- [ ] Invoiced flag on timesheet entries
- [ ] Filter by invoiced status
- [ ] Link to invoice when applicable
- [ ] Prevent duplicate billing

**Priority:** Should Have  
**Status:** Implemented

---

### 10. Labels & Categorization

#### US-TS090: Add Labels to Timesheets
**As a** team member  
**I want to** add labels to my timesheet entries  
**So that** I can categorize different types of work (regular, overtime, travel, etc.)

**Acceptance Criteria:**
- [x] Labels field available in timesheet dialog
- [x] Multiple labels can be selected per entry
- [x] Default label options: Regular Hours, Overtime, Travel Time, Meeting, Training, Site Visit
- [x] Labels are configurable in Settings > Field Categories
- [x] Labels display with color coding
- [x] Toggle labels on/off in the form

**Priority:** Nice to Have  
**Status:** Implemented

---

## Current State Summary

### Implemented Features
- Timesheet entry creation and editing
- Create timesheets from global header "New" menu
- Clock in/out functionality on Timesheets page with timer display
- Clock-in widget available on dashboard header
- Bi-directional time calculation (start+end calculates duration, start+duration calculates end)
- Break period tracking with start/end times (auto-calculates break duration)
- Required fields: project, user, date, cost code, start/end time
- Custom labels for categorizing time entries (Regular, Overtime, Travel, etc.)
- Permission-based editing: own timesheets + admins/owners/managers can edit all
- Split time across multiple cost codes
- Three views: Table, Weekly, Calendar
- Filtering by project, user, status, date range
- Search by description
- Approval workflow (submit, approve, reject)
- Rapid approval modal for batch processing
- Project-specific timesheet views
- Cost code assignment with budget integration
- Hourly rate and total calculation
- Excel export with all fields
- Invoiced status tracking
- Configurable table columns
- Labour hours budget tracking via cost codes

### Known Limitations
- [ ] No import from CSV/Excel
- [ ] No mobile-optimized clock in/out
- [ ] No geolocation for clock-in verification
- [ ] No approval notifications
- [ ] No overtime calculations
- [ ] No timesheet templates for recurring entries

---

## Future Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| Overtime Calculations | Auto-calculate overtime based on rules | Nice to Have |
| Geolocation | Verify clock-in location | Nice to Have |
| Timesheet Templates | Quick entry for recurring work | Should Have |
| Approval Notifications | Notify managers of pending approvals | Should Have |
| Mobile Clock-In | Optimized mobile clock-in experience | Should Have |
| Break Tracking | Automatic break detection/reminders | Nice to Have |

---

## Permissions Reference

### Timesheet Permissions (to be added to Roles & Permissions)

#### View Permissions
- `timesheets.view_own` - View only own timesheet entries
- `timesheets.view_all` - View all company timesheet entries

#### Create Permissions
- `timesheets.create` - Create timesheet entries
- `timesheets.clock_in` - Use clock in/out feature

#### Edit Permissions
- `timesheets.edit_own` - Edit own timesheet entries (submitted status only)
- `timesheets.edit_all` - Edit any timesheet entries regardless of owner

#### Delete Permissions
- `timesheets.delete_own` - Delete own submitted timesheet entries
- `timesheets.delete_all` - Delete any timesheet entries (admin only)

#### Approval Permissions
- `timesheets.approve` - Approve/reject submitted timesheets
- `timesheets.recall` - Recall submitted timesheets for editing

#### Export Permissions
- `timesheets.export` - Export timesheet data to Excel/CSV

### Timesheet Notifications (to be added to Notification Settings)
- Timesheet submitted for approval
- Timesheet approved
- Timesheet rejected
- Reminder to submit timesheets

---

## Document Change Log

| Date | Changes |
|------|---------|
| 2026-02-04 | Initial user story document created based on current implementation |
| 2026-02-05 | Updated per user notes: clarified required fields (start/end time, cost code), confirmed budget integration via cost codes, confirmed export functionality, added global header "New" menu access |
| 2026-02-05 | Added comprehensive permissions reference, delete permission criteria, table drag-drop/reordering criteria, week start preference criteria |

---

## User Notes Addressed

1. ~~Links to budget labour hours~~ - Works via cost codes ✓
2. ~~Link to estimate~~ - Unnecessary (covered by cost codes)
3. Export timesheets - Confirmed working ✓
4. ~~Import timesheets~~ - Not implemented (deferred)
5. ~~Quick Actions / Global 'New'~~ - Global header confirmed working ✓
6. Require start/end time and cost code - Implemented ✓
7. ~~Add Timesheet button~~ - Disregarded (Clock In button sufficient)
8. Bi-directional time calculation - Implemented ✓
9. Labels for timesheets - Implemented ✓
10. Clock In button on Timesheets page - Implemented ✓
11. Break period start/finish time tracking - Implemented ✓
12. Permission-based editing for timesheets - Implemented ✓
13. Brainstorm permissions for timesheets - Documented in Permissions Reference ✓
14. US-TS004 delete permission option - Added to acceptance criteria ✓
15. US-TS010 table matching Tasks with drag-drop, separate start/end columns - Added to acceptance criteria (pending implementation)
16. US-TS020 week start preference (Monday/Sunday) - Added to acceptance criteria (pending implementation)
