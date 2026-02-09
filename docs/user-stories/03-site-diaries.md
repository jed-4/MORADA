# BuildPro User Stories: Site Diaries

## Epic Overview

### Description
The Site Diary system provides a structured way to record daily site activities, conditions, and progress. Company-wide templates define the form structure (data layout), and project-specific entries (the actual "site diaries") capture field information. The system supports customizable fields, weather tracking, photo galleries, file uploads, and client sharing capabilities.

**Terminology Note:** A "Site Diary Template" is the form layout that defines what fields appear. A "Site Diary" (entry) is the actual diary record created from a template.

### Business Value
- Consistent documentation across all projects
- Legal protection with timestamped site records
- Client communication through shareable diary entries
- Weather documentation for delay claims
- Photo evidence of site conditions and progress
- Flexible templates to match different project types
- Accountability tracking on checkbox items (who ticked, when)

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner | Standardized templates, client-ready reports, overview of all projects |
| **Project Manager** | Manages specific projects | Review site activities, track progress, ensure documentation compliance |
| **Site Supervisor** | On-site team lead | Quick entry creation, photo uploads, weather logging |
| **Field Worker** | On-site labour | View daily tasks, reference previous entries |
| **Office Admin** | Administrative support | Template management, report generation |

---

## User Stories

### 1. Template Management

#### US-SD001: Create Site Diary Template
**As a** builder/admin  
**I want to** create a site diary template with custom fields  
**So that** my team has a consistent form structure for recording site information

**Acceptance Criteria:**
- [x] Create template with name and description
- [x] Add multiple field types: text, textarea, number, date, select, checkbox, file, photo-gallery
- [x] Mark fields as required or optional
- [x] Define select field options
- [x] Set field order via drag-and-drop
- [x] Template is company-wide (available on all projects)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD002: Edit Site Diary Template
**As a** builder/admin  
**I want to** modify existing templates  
**So that** I can improve the form structure over time

**Acceptance Criteria:**
- [x] Edit template name and description
- [x] Add, remove, or reorder fields
- [x] Changes apply to new entries (existing entries retain original structure)
- [ ] Confirmation when editing template with existing entries

**Implementation Note:** The template is just the form layout. The "site diary" is the entry created from that template. Users "create a site diary from a template".

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD003: Set Default Template
**As a** builder/admin  
**I want to** set a default template  
**So that** new entries automatically use my preferred structure

**Acceptance Criteria:**
- [x] "Set as Default" option on template
- [x] Only one template can be default at a time
- [x] Default template pre-selected when creating new entries
- [x] Visual indicator (star icon) shows which template is default

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD004: Duplicate Template
**As a** builder/admin  
**I want to** duplicate an existing template  
**So that** I can create variations without starting from scratch

**Acceptance Criteria:**
- [x] "Duplicate" option in template menu
- [x] Copy created with "(Copy)" suffix
- [x] All fields and settings copied
- [x] User can immediately edit the duplicate

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD005: Archive/Delete Template
**As a** builder/admin  
**I want to** archive templates no longer in use  
**So that** the template list stays manageable

**Acceptance Criteria:**
- [x] Delete/Archive option in template menu
- [x] Archived templates hidden from selection
- [x] Existing entries using archived template remain viewable
- [ ] Confirmation required before archiving

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD006: Import & Export Templates
**As a** builder/admin  
**I want to** import and export templates  
**So that** I can share templates between systems or back them up

**Acceptance Criteria:**
- [x] Import from Excel format (.xlsx/.xls)
- [x] Drag-and-drop file upload zone
- [x] Validation of field structure
- [x] Success/error feedback on import
- [x] Export templates to Excel format
- [ ] Preview imported templates before confirming

**Priority:** Nice to Have  
**Status:** Implemented (import working, export added)

---

### 2. Site Diary Entries

#### US-SD010: Create Site Diary Entry
**As a** site supervisor  
**I want to** create a new site diary entry from a template  
**So that** I can document today's site activities

**Acceptance Criteria:**
- [x] Select project (if not already in project context)
- [x] Select template (default template pre-selected)
- [x] Enter title and date/time
- [x] Fill in template fields based on type
- [x] Required fields must be completed before saving
- [x] Entry saved with creator name and timestamp

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD011: Edit Site Diary Entry
**As a** site supervisor  
**I want to** edit an existing diary entry  
**So that** I can add details or correct information

**Acceptance Criteria:**
- [ ] Open entry in edit mode
- [ ] Modify any field values
- [ ] Add or remove photos
- [ ] Update date/time if needed
- [ ] Save changes with updated timestamp

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD012: View Site Diary Entry
**As a** team member  
**I want to** view diary entry details  
**So that** I can reference site information

**Acceptance Criteria:**
- [ ] View all field values
- [ ] See photos and attachments
- [ ] View weather information
- [ ] See creator and timestamps
- [ ] Expand entry for full details

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD013: Delete Site Diary Entry
**As a** site supervisor with delete permission  
**I want to** delete incorrect entries  
**So that** records remain accurate

**Acceptance Criteria:**
- [x] Delete option in entry menu
- [x] Confirmation required
- [x] Permission check: requires `projects.site_diary` delete permission
- [x] Server-side permission validation (403 if no permission)
- [x] Delete button hidden when user lacks permission
- [ ] Associated attachments are cleaned up

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD014: Set Reminder on Entry
**As a** site supervisor  
**I want to** set a reminder for a diary entry  
**So that** I'm notified to follow up on specific items

**Acceptance Criteria:**
- [ ] "Set Reminder" option in entry menu
- [ ] Select reminder date/time
- [ ] Reminder creates notification at specified time
- [ ] Notification links back to the entry

**Priority:** Low  
**Status:** Hidden (feature available but removed from UI per user decision - considered unnecessary)

---

### 3. Template Field Types

#### US-SD020: Text Field
**As a** template creator  
**I want to** add text fields  
**So that** users can enter short text responses

**Acceptance Criteria:**
- [x] Single-line text input
- [x] Optional required validation
- [ ] Placeholder text support

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD021: Textarea Field
**As a** template creator  
**I want to** add textarea fields  
**So that** users can enter longer descriptions

**Acceptance Criteria:**
- [x] Multi-line text input
- [x] Expandable text area
- [x] Optional required validation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD022: Number Field
**As a** template creator  
**I want to** add number fields  
**So that** users can enter numeric values (counts, measurements)

**Acceptance Criteria:**
- [x] Numeric input validation
- [ ] Optional min/max constraints
- [x] Decimal support

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD023: Date Field
**As a** template creator  
**I want to** add date fields  
**So that** users can select dates for scheduling or tracking

**Acceptance Criteria:**
- [x] Date picker component
- [x] Standard date format display
- [x] Optional required validation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD024: Select/Dropdown Field
**As a** template creator  
**I want to** add dropdown select fields  
**So that** users can choose from predefined options

**Acceptance Criteria:**
- [x] Define list of options (label/value pairs)
- [x] Single selection dropdown
- [x] Optional required validation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD025: Checkbox Field with Accountability
**As a** template creator  
**I want to** add checkbox fields that track who checks them  
**So that** there is accountability for sign-offs and completions

**Acceptance Criteria:**
- [x] Boolean checkbox input
- [x] Optional "must be checked" validation
- [x] Clear label display
- [x] Records which user checked the box
- [x] Records timestamp when checkbox was ticked
- [x] Displays checker name and time alongside the checkbox

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD026: File Attachment Field
**As a** template creator  
**I want to** add file attachment fields  
**So that** users can upload documents and photos

**Acceptance Criteria:**
- [x] File upload to object storage via presigned URLs
- [x] Support common file types (PDF, Word, images, etc.)
- [x] Multiple photo upload from phone camera or computer file system
- [x] File name and size display
- [x] Download capability
- [x] Photo preview thumbnails

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD027: Photo Gallery Field
**As a** template creator  
**I want to** add photo gallery fields  
**So that** users can capture site photos for specific items

**Acceptance Criteria:**
- [x] Multiple photo upload per field
- [x] Configurable max photos (default 3)
- [x] Photo preview thumbnails
- [x] Full-size photo viewing
- [x] Upload from phone camera or computer

**Priority:** Should Have  
**Status:** Implemented

---

### 4. Weather Integration

#### US-SD030: Record Weather Conditions
**As a** site supervisor  
**I want to** record weather conditions for the day  
**So that** weather-related delays are documented

**Acceptance Criteria:**
- [x] Weather data fields: temperature, condition, humidity, wind, precipitation
- [x] Weather icon display
- [ ] Auto-fetch weather from API (requires API key)
- [x] Manual entry option
- [x] Weather displayed on entry card

**Priority:** Should Have  
**Status:** Partial (manual entry works, auto-fetch pending)

---

### 5. Photos & Attachments

#### US-SD040: Add Overall Photos
**As a** site supervisor  
**I want to** add general site photos to an entry  
**So that** I can document overall site conditions

**Acceptance Criteria:**
- [ ] Photo upload section at bottom of entry
- [ ] Unlimited photos (unlike field galleries)
- [ ] Photo preview and full-size viewing
- [ ] Photos stored in object storage

**Priority:** Must Have  
**Status:** Implemented (data structure exists)

---

### 6. Filtering & Search

#### US-SD050: Filter Entries by Template
**As a** project manager  
**I want to** filter entries by template type  
**So that** I can view specific types of diary entries

**Acceptance Criteria:**
- [x] Template filter dropdown
- [x] "All" option to show all templates
- [x] Filter persists during session

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD051: Search Entries
**As a** project manager  
**I want to** search diary entries  
**So that** I can find specific information quickly

**Acceptance Criteria:**
- [x] Search by entry title
- [x] Search by template name
- [x] Search within template form field values (secondary search)
- [x] Real-time filtering as user types

**Priority:** Should Have  
**Status:** Implemented

---

### 7. Client Sharing

#### US-SD060: Share Entry with Client
**As a** project manager  
**I want to** share specific diary entries with clients  
**So that** they can see site progress

**Acceptance Criteria:**
- [x] "Share with Client" toggle on entry
- [ ] Shared entries visible in client portal
- [x] Control over which entries are shared
- [x] Visual indicator for shared entries (badge)

**Priority:** Should Have  
**Status:** Partial (field exists, client portal pending)

---

### 8. Labels & Organization

#### US-SD070: Add Labels to Entry
**As a** site supervisor  
**I want to** add labels to diary entries  
**So that** I can categorize and organize entries

**Acceptance Criteria:**
- [ ] Add multiple labels to an entry
- [ ] Create new labels on the fly
- [ ] Filter entries by label
- [ ] Labels displayed on entry card

**Priority:** Nice to Have  
**Status:** Implemented (data structure exists)

---

### 9. Project Context

#### US-SD080: View Project Site Diaries
**As a** project manager  
**I want to** view all diary entries for a specific project  
**So that** I can review project documentation

**Acceptance Criteria:**
- [x] Site Diary accessible from project navigation
- [x] Shows only entries for that project
- [x] Entry count displayed
- [x] Same functionality as company-wide view

**Priority:** Must Have  
**Status:** Implemented

---

## Current State Summary

### Implemented Features
- Company-wide template creation and management
- Template field types: text, textarea, number, date, select, checkbox, file, photo-gallery
- Set default template (star indicator)
- Duplicate and archive templates
- Import templates from Excel
- Export templates to Excel
- Create site diary entries from templates
- Template selection when creating entries (default pre-selected)
- Required field validation
- Weather data recording (manual)
- Filter by template
- Search by title, template name, and field values
- Delete entries with permission checks
- Labels support (data structure)
- Project-specific diary views
- Share with client flag
- Checkbox accountability (who checked, when)
- File and photo uploads via Object Storage

### Known Limitations
- [ ] No calendar view for entries
- [ ] No PDF export for entries
- [ ] No offline entry creation (mobile)
- [ ] No auto-fetch weather (requires API key)
- [ ] Client portal not yet implemented
- [ ] No entry duplication / quick-fill from previous day
- [ ] No bulk operations
- [ ] No voice notes / audio recording

---

## Future Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| Calendar View | View entries on a calendar with date navigation | Should Have |
| PDF Export | Generate formatted PDF reports from diary entries | Should Have |
| Auto Weather | Fetch weather automatically from weather API based on project location | Nice to Have |
| Offline Mode | Create entries offline on mobile, sync when connected | Should Have |
| Client Portal | Client-facing view for shared entries | Should Have |
| Entry Templates / Quick-Fill | Quick-fill from previous day's entry to speed up daily recording | Nice to Have |
| Voice Notes | Audio recording capability on entries | Nice to Have |
| Camera Access | Direct camera access from mobile browser for photo capture | Should Have |

---

## Permissions Reference

### Site Diary Permissions (Roles & Permissions page)

Permission ID: `46dc059b-7125-4549-bac0-a40f4052155e` (Category: Projects)

CRUD permissions for site diary entries:
- **View** - View site diary entries
- **Add** - Create new site diary entries
- **Edit** - Edit site diary entries
- **Delete** - Delete site diary entries

#### Built-in Admin Bypass
Built-in admin roles (General Manager, Admin, Owner) automatically bypass all permission checks and have full access to all site diary operations.

---

## Document Change Log

| Date | Changes |
|------|---------|
| 2026-02-04 | Initial user story document created based on current implementation |
| 2026-02-09 | Comprehensive review with user notes. Updated terminology (template = form, entry = site diary). Ticked implemented criteria for US-SD003, US-SD004. Added export to US-SD006. Updated US-SD013 with permission requirements. Hidden US-SD014 (reminder deemed unnecessary). Added checkbox accountability to US-SD025. Updated US-SD026 with upload requirements. Added search within field values to US-SD051. Added future enhancements: Calendar View, PDF Export, Auto Weather, Offline Mode, Client Portal, Entry Templates, Voice Notes, Camera Access. |

---

## User Notes Addressed

1. US-SD002: Template terminology clarified - template is the form, entry is the site diary. Users "create a site diary from a template" ✓
2. US-SD003: Set Default Template - Confirmed working (star icon, pre-selection) ✓
3. US-SD004: Duplicate Template - Confirmed working (Copy suffix) ✓
4. US-SD006: Import exists, export added ✓
5. US-SD013: Delete needs to work with permission checks - Implemented ✓
6. US-SD014: Reminder considered unnecessary - Hidden from UI ✓
7. US-SD025: Checkbox accountability - Track who checks and when ✓
8. US-SD026: File attachments - Upload from phone/computer with Object Storage ✓
9. US-SD051: Search within field values (secondary search) ✓
10. Calendar View - Added to future enhancements
11. PDF Export - Added to future enhancements
12. Auto Weather - Added to future enhancements
13. Offline Mode - Added to future enhancements
14. Client Portal - Added to future enhancements
15. Entry Templates / Quick-fill - Added to future enhancements
16. Voice Notes - Added to future enhancements
