# BuildPro User Stories: Site Diaries

## Epic Overview

### Description
The Site Diary system provides a structured way to record daily site activities, conditions, and progress. Company-wide templates define the data structure, and project-specific entries capture field information. The system supports customizable fields, weather tracking, photo galleries, and client sharing capabilities.

### Business Value
- Consistent documentation across all projects
- Legal protection with timestamped site records
- Client communication through shareable diary entries
- Weather documentation for delay claims
- Photo evidence of site conditions and progress
- Flexible templates to match different project types

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
**So that** my team has a consistent structure for recording site information

**Acceptance Criteria:**
- [ ] Create template with name and description
- [ ] Add multiple field types: text, textarea, number, date, select, checkbox, file, photo-gallery
- [ ] Mark fields as required or optional
- [ ] Define select field options
- [ ] Set field order via drag-and-drop
- [ ] Template is company-wide (available on all projects)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD002: Edit Site Diary Template
**As a** builder/admin  
**I want to** modify existing templates  
**So that** I can improve the data capture structure over time

**Acceptance Criteria:**
- [ ] Edit template name and description
- [ ] Add, remove, or reorder fields
- [ ] Changes apply to new entries (existing entries retain original structure)
- [ ] Confirmation when editing template with existing entries

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD003: Set Default Template
**As a** builder/admin  
**I want to** set a default template  
**So that** new entries automatically use my preferred structure

**Acceptance Criteria:**
- [ ] "Set as Default" option on template
- [ ] Only one template can be default at a time
- [ ] Default template pre-selected when creating new entries
- [ ] Visual indicator shows which template is default

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD004: Duplicate Template
**As a** builder/admin  
**I want to** duplicate an existing template  
**So that** I can create variations without starting from scratch

**Acceptance Criteria:**
- [ ] "Duplicate" option in template menu
- [ ] Copy created with "(Copy)" suffix
- [ ] All fields and settings copied
- [ ] User can immediately edit the duplicate

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD005: Archive/Delete Template
**As a** builder/admin  
**I want to** archive templates no longer in use  
**So that** the template list stays manageable

**Acceptance Criteria:**
- [ ] Delete/Archive option in template menu
- [ ] Archived templates hidden from selection
- [ ] Existing entries using archived template remain viewable
- [ ] Confirmation required before archiving

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD006: Import Templates
**As a** builder/admin  
**I want to** import templates from a file  
**So that** I can quickly set up templates from another system or project

**Acceptance Criteria:**
- [ ] Import from CSV/Excel format
- [ ] Preview imported templates before confirming
- [ ] Validation of field structure
- [ ] Success/error feedback on import

**Priority:** Nice to Have  
**Status:** Implemented

---

### 2. Site Diary Entries

#### US-SD010: Create Site Diary Entry
**As a** site supervisor  
**I want to** create a new site diary entry  
**So that** I can document today's site activities

**Acceptance Criteria:**
- [ ] Select project (if not already in project context)
- [ ] Select template (default template pre-selected)
- [ ] Enter title and date/time
- [ ] Fill in template fields based on type
- [ ] Required fields must be completed before saving
- [ ] Entry saved with creator name and timestamp

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
**As a** site supervisor  
**I want to** delete incorrect entries  
**So that** records remain accurate

**Acceptance Criteria:**
- [ ] Delete option in entry menu
- [ ] Confirmation required
- [ ] Deleted entries cannot be recovered
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

**Priority:** Should Have  
**Status:** Implemented

---

### 3. Template Field Types

#### US-SD020: Text Field
**As a** template creator  
**I want to** add text fields  
**So that** users can enter short text responses

**Acceptance Criteria:**
- [ ] Single-line text input
- [ ] Optional required validation
- [ ] Placeholder text support

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD021: Textarea Field
**As a** template creator  
**I want to** add textarea fields  
**So that** users can enter longer descriptions

**Acceptance Criteria:**
- [ ] Multi-line text input
- [ ] Expandable text area
- [ ] Optional required validation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD022: Number Field
**As a** template creator  
**I want to** add number fields  
**So that** users can enter numeric values (counts, measurements)

**Acceptance Criteria:**
- [ ] Numeric input validation
- [ ] Optional min/max constraints
- [ ] Decimal support

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD023: Date Field
**As a** template creator  
**I want to** add date fields  
**So that** users can select dates for scheduling or tracking

**Acceptance Criteria:**
- [ ] Date picker component
- [ ] Standard date format display
- [ ] Optional required validation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD024: Select/Dropdown Field
**As a** template creator  
**I want to** add dropdown select fields  
**So that** users can choose from predefined options

**Acceptance Criteria:**
- [ ] Define list of options (label/value pairs)
- [ ] Single selection dropdown
- [ ] Optional required validation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD025: Checkbox Field
**As a** template creator  
**I want to** add checkbox fields  
**So that** users can toggle yes/no options

**Acceptance Criteria:**
- [ ] Boolean checkbox input
- [ ] Optional "must be checked" validation
- [ ] Clear label display

**Priority:** Must Have  
**Status:** Implemented

---

#### US-SD026: File Attachment Field
**As a** template creator  
**I want to** add file attachment fields  
**So that** users can upload documents

**Acceptance Criteria:**
- [ ] File upload to object storage
- [ ] Support common file types (PDF, Word, etc.)
- [ ] File name and size display
- [ ] Download capability

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD027: Photo Gallery Field
**As a** template creator  
**I want to** add photo gallery fields  
**So that** users can capture site photos for specific items

**Acceptance Criteria:**
- [ ] Multiple photo upload per field
- [ ] Configurable max photos (default 3)
- [ ] Photo preview thumbnails
- [ ] Full-size photo viewing

**Priority:** Should Have  
**Status:** Implemented

---

### 4. Weather Integration

#### US-SD030: Record Weather Conditions
**As a** site supervisor  
**I want to** record weather conditions for the day  
**So that** weather-related delays are documented

**Acceptance Criteria:**
- [ ] Weather data fields: temperature, condition, humidity, wind, precipitation
- [ ] Weather icon display
- [ ] Manual entry or auto-fetch option
- [ ] Weather displayed on entry card

**Priority:** Should Have  
**Status:** Implemented

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
**Status:** Implemented

---

### 6. Filtering & Search

#### US-SD050: Filter Entries by Template
**As a** project manager  
**I want to** filter entries by template type  
**So that** I can view specific types of diary entries

**Acceptance Criteria:**
- [ ] Template filter dropdown
- [ ] "All" option to show all templates
- [ ] Filter persists during session

**Priority:** Should Have  
**Status:** Implemented

---

#### US-SD051: Search Entries
**As a** project manager  
**I want to** search diary entries  
**So that** I can find specific information quickly

**Acceptance Criteria:**
- [ ] Search by entry title
- [ ] Search by template name
- [ ] Real-time filtering as user types

**Priority:** Should Have  
**Status:** Implemented

---

### 7. Client Sharing

#### US-SD060: Share Entry with Client
**As a** project manager  
**I want to** share specific diary entries with clients  
**So that** they can see site progress

**Acceptance Criteria:**
- [ ] "Share with Client" toggle on entry
- [ ] Shared entries visible in client portal
- [ ] Control over which entries are shared
- [ ] Visual indicator for shared entries

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
- [ ] Site Diary accessible from project navigation
- [ ] Shows only entries for that project
- [ ] Entry count displayed
- [ ] Same functionality as company-wide view

**Priority:** Must Have  
**Status:** Implemented

---

## Current State Summary

### Implemented Features
- Company-wide template creation and management
- Template field types: text, textarea, number, date, select, checkbox, file, photo-gallery
- Set default template
- Duplicate and archive templates
- Import templates from file
- Create, edit, view, delete diary entries
- Template selection when creating entries
- Required field validation
- Weather data recording
- Overall photo gallery (unlimited)
- Field-specific photo galleries (configurable limit)
- Filter by template
- Search by title/template name
- Set reminders on entries
- Labels support (data structure)
- Project-specific diary views
- Share with client flag

### Known Limitations
- [ ] No calendar view for entries
- [ ] No export to PDF/Excel
- [ ] No offline entry creation (mobile)
- [ ] No auto-fetch weather (requires API key)
- [ ] Client portal not yet implemented
- [ ] No entry duplication
- [ ] No bulk operations

---

## Future Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| Calendar View | View entries on a calendar | Should Have |
| PDF Export | Generate PDF reports from entries | Should Have |
| Auto Weather | Fetch weather from weather API | Nice to Have |
| Offline Mode | Create entries offline on mobile | Should Have |
| Client Portal | Client-facing view for shared entries | Should Have |
| Entry Templates | Quick-fill from previous day | Nice to Have |
| Voice Notes | Audio recording on entries | Nice to Have |

---

## Permissions Reference

### Site Diary Permissions
- `site_diary.create` - Create diary entries
- `site_diary.read` - View diary entries
- `site_diary.update` - Edit diary entries
- `site_diary.delete` - Delete diary entries
- `site_diary.templates` - Manage templates
- `site_diary.share` - Share entries with clients

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
