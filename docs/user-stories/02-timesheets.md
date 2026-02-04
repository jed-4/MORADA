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
- [ ] User can create a timesheet entry from the Timesheets page
- [ ] Entry requires: project, user, date
- [ ] Entry has optional fields: start time, end time, break duration, description, cost code, hourly rate
- [ ] Two entry modes available: Time-based (start/end) or Duration-based (hours)
- [ ] Entry is saved and appears in the timesheets list
- [ ] Default status is "Draft"

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS002: Clock In/Out
**As a** field worker  
**I want to** quickly clock in when I start work and clock out when I finish  
**So that** my hours are accurately recorded without manual entry

**Acceptance Criteria:**
- [ ] "Clock In" button available on Timesheets page
- [ ] Clock in creates a timesheet with current timestamp
- [ ] Active clock-in shows running timer
- [ ] Clock out records end time and calculates duration
- [ ] Break duration can be recorded
- [ ] Clock-in widget available on dashboard

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS003: Edit Timesheet Entry
**As a** team member  
**I want to** edit my timesheet entries before submission  
**So that** I can correct mistakes or add details

**Acceptance Criteria:**
- [ ] User can edit draft timesheet entries
- [ ] All fields can be modified
- [ ] Changes are saved immediately
- [ ] Approved entries cannot be edited (or require re-approval)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS004: Delete Timesheet Entry
**As a** team member  
**I want to** delete incorrect timesheet entries  
**So that** I can remove mistakes before submission

**Acceptance Criteria:**
- [ ] User can delete draft timesheet entries
- [ ] Confirmation required before deletion
- [ ] Approved entries cannot be deleted (or require manager action)

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
- [ ] Table displays: date, user, project, cost code, time, break, hours, rate, total, status, description
- [ ] Columns are configurable (show/hide)
- [ ] Columns are resizable
- [ ] Table supports sorting and filtering
- [ ] Clicking an entry opens the edit dialog

**Priority:** Must Have  
**Status:** Implemented

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
- [ ] Filter by status (draft, submitted, approved, rejected)
- [ ] Filter by date range (this week, last week, this month, custom)
- [ ] Filter by invoiced status
- [ ] Multiple filters can be combined
- [ ] Active filters shown as badges

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS021: Search Timesheets
**As a** manager  
**I want to** search timesheets by description  
**So that** I can find entries related to specific work

**Acceptance Criteria:**
- [ ] Search box filters by description text
- [ ] Real-time filtering as user types

**Priority:** Should Have  
**Status:** Implemented

---

### 4. Approval Workflow

#### US-TS030: Submit Timesheet for Approval
**As a** team member  
**I want to** submit my timesheet entries for approval  
**So that** my manager can review and approve my hours

**Acceptance Criteria:**
- [ ] User can submit draft entries
- [ ] Status changes from "Draft" to "Submitted"
- [ ] Submitted entries can be recalled before approval
- [ ] Manager receives notification of pending approvals

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS031: Approve Timesheet
**As a** manager  
**I want to** approve submitted timesheets  
**So that** hours are confirmed for billing and payroll

**Acceptance Criteria:**
- [ ] Approve button available for submitted entries
- [ ] Status changes from "Submitted" to "Approved"
- [ ] Approved hours update project labour totals
- [ ] Approval is logged with timestamp and user

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS032: Reject Timesheet
**As a** manager  
**I want to** reject incorrect timesheets  
**So that** team members can correct and resubmit

**Acceptance Criteria:**
- [ ] Reject button available for submitted entries
- [ ] Status changes from "Submitted" to "Rejected"
- [ ] Optional rejection reason/comment
- [ ] Team member notified of rejection

**Priority:** Must Have  
**Status:** Implemented

---

#### US-TS033: Rapid Approval
**As a** manager  
**I want to** quickly approve multiple timesheets at once  
**So that** I can efficiently process pending approvals

**Acceptance Criteria:**
- [ ] "Rapid Approval" button shows count of pending entries
- [ ] Modal displays all pending timesheets
- [ ] Checkbox to select entries for approval
- [ ] "Approve Selected" or "Approve All" options
- [ ] Batch approval processes all selected entries

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
- [ ] Project shows pending hours (unapproved)
- [ ] Project shows approved hours
- [ ] Comparison to estimated labour hours
- [ ] Warning when approaching or exceeding budget

**Priority:** Should Have  
**Status:** Implemented

---

### 6. Cost Code Integration

#### US-TS050: Assign Cost Code to Timesheet
**As a** site supervisor  
**I want to** assign a cost code to my timesheet entry  
**So that** labour hours are categorized correctly for reporting

**Acceptance Criteria:**
- [ ] Cost code dropdown in timesheet entry form
- [ ] Only cost codes available for timesheets shown
- [ ] Cost code displayed in timesheet table
- [ ] Filter by cost code available

**Priority:** Should Have  
**Status:** Implemented

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
- [ ] Export button on Timesheets page
- [ ] Exports currently filtered entries
- [ ] Excel format with all columns
- [ ] Filename includes project name and date

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

## Current State Summary

### Implemented Features
- Timesheet entry creation and editing
- Clock in/out functionality
- Time entry modes: time-based and duration-based
- Split time across multiple cost codes
- Three views: Table, Weekly, Calendar
- Filtering by project, user, status, date range
- Search by description
- Approval workflow (submit, approve, reject)
- Rapid approval modal for batch processing
- Project-specific timesheet views
- Cost code assignment
- Hourly rate and total calculation
- Excel export
- Invoiced status tracking
- Configurable table columns
- Labour hours budget tracking on projects

### Known Limitations
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
- `timesheets.create` - Create timesheet entries
- `timesheets.read` - View timesheets
- `timesheets.update` - Edit timesheet entries
- `timesheets.delete` - Delete timesheet entries
- `timesheets.approve` - Approve/reject submitted timesheets
- `timesheets.export` - Export timesheet data

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

---

## Review Notes

**This is an initial draft based on code review.** Please provide your numbered notes for:
- Features that are missing or described incorrectly
- Behaviors that should work differently
- New requirements or enhancements needed
- Any bugs or issues you've observed

*Format your notes like the Tasks notes (1, 2, 3...) and I'll incorporate them all into the final comprehensive document.*
