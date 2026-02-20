# RFIs (Requests for Information) - User Stories

## Epic Overview
RFIs (Requests for Information) enable builders to formally submit questions to architects, engineers, consultants, subcontractors, and clients when project documentation is unclear or incomplete. The feature supports the full RFI lifecycle from drafting through submission, review, and resolution, with discussion threads, file attachments, email distribution, PDF generation, and reusable templates.

## Business Value
In Australian residential construction, ambiguities in drawings, specifications, or contract documents are common and can lead to costly rework, delays, and disputes if not formally resolved. A structured RFI system ensures all queries are documented with unique reference numbers, directed to the appropriate party, tracked through to resolution, and preserved as part of the project record. This protects builders legally, reduces miscommunication, and provides an audit trail that is essential for managing complex residential builds, renovations, and multi-dwelling projects.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Create and manage RFIs to resolve project uncertainties efficiently |
| Site Supervisor | Site Manager | Submit RFIs from site when encountering drawing discrepancies |
| Architect | Design Professional | Review and respond to RFIs about design intent and documentation |
| Admin | Office Administrator | Track RFI status, manage templates, and ensure timely responses |
| Engineer | Structural/Services Engineer | Respond to technical RFIs about structural or services design |

## User Stories

### US-RI001: View All RFIs
**As a** Builder/PM, **I want to** view a list of all RFIs across projects, **so that** I can monitor outstanding information requests and their status.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display RFIs in a table with RFI number, subject, project, status, priority, directed to, and due date
- [ ] Support text search across RFI subject and question
- [ ] Filter by status (draft, submitted, under_review, answered, closed)
- [ ] Filter by priority (low, normal, high, urgent)
- [ ] Show total RFI count
- [ ] When accessed within a project context, scope to that project

---

### US-RI002: Create New RFI
**As a** Builder/PM, **I want to** create a new RFI, **so that** I can formally request information about a project ambiguity.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Auto-generate RFI number in format "XXXX-RFI-XXX" (e.g. "4504-RFI-001")
- [ ] Require project selection and subject
- [ ] Require question content with minimum 10 characters (rich text editor)
- [ ] Select directed-to type (client/architect/engineer/consultant/subcontractor/other)
- [ ] Select or enter directed-to contact (name, email, contactId)
- [ ] Set priority level (low/normal/high/urgent)
- [ ] Set optional due date
- [ ] Add optional internal notes
- [ ] Default status to "draft"
- [ ] Navigate to RFI detail on successful creation

---

### US-RI003: Create RFI from Template
**As a** Builder/PM, **I want to** create an RFI from a saved template, **so that** I can quickly submit common information requests without retyping.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select from available RFI templates when creating a new RFI
- [ ] Pre-populate subject, question template, directed-to type, priority, and internal notes
- [ ] Allow editing of pre-populated fields before submission
- [ ] Template selection is optional

---

### US-RI004: Edit RFI Details
**As a** Builder/PM, **I want to** edit an existing RFI, **so that** I can update the question, attachments, or other details before submitting.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Load existing RFI data into form fields
- [ ] Allow editing subject, question, directed-to, priority, due date, and internal notes
- [ ] Allow editing when status is draft or submitted
- [ ] Restrict editing of certain fields after RFI is answered/closed
- [ ] Show current status badge in header
- [ ] Save changes via PATCH /api/rfis/:id

---

### US-RI005: RFI Status Workflow
**As a** Builder/PM, **I want to** move RFIs through a defined status workflow, **so that** I can track each RFI from creation to resolution.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Support status transitions: draft → submitted → under_review → answered → closed
- [ ] Show appropriate action buttons based on current status
- [ ] Record status change timestamps
- [ ] Prevent invalid status transitions
- [ ] Show status badge with colour coding on list and detail views

---

### US-RI006: Submit RFI
**As a** Builder/PM, **I want to** submit a draft RFI, **so that** it is formally sent for review and response.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show "Submit" action when status is "draft"
- [ ] Update status to "submitted"
- [ ] Record sentAt timestamp and sentToEmail
- [ ] Validate required fields before submission
- [ ] Show success toast notification

---

### US-RI007: Direct RFI to Specific Contact Type
**As a** Builder/PM, **I want to** direct an RFI to a specific type of contact (architect, engineer, consultant, subcontractor, or client), **so that** the right party receives and responds to the information request.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select directed-to type from dropdown (client/architect/engineer/consultant/subcontractor/other)
- [ ] Select specific contact from contacts list or enter manually
- [ ] Store directedToContactId, directedToName, and directedToEmail
- [ ] Display directed-to information on RFI detail and list views

---

### US-RI008: Respond to RFI
**As a** Builder/PM, **I want to** record a response to an RFI, **so that** the information request is formally answered and documented.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Provide rich text editor for response content
- [ ] Record respondedById, respondedByName, and respondedAt
- [ ] Update status to "answered" when response is submitted
- [ ] Support response file attachments (responseAttachmentUrls, responseAttachmentFileNames)
- [ ] Show response section on RFI detail view

---

### US-RI009: Close RFI
**As a** Builder/PM, **I want to** close an answered RFI, **so that** I can mark it as fully resolved.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show "Close" action when status is "answered"
- [ ] Update status to "closed"
- [ ] Record closedAt timestamp
- [ ] Closed RFIs remain viewable but not editable

---

### US-RI010: Add Comments to RFI
**As a** Builder/PM, **I want to** add discussion comments to an RFI, **so that** I can communicate with team members about the information request.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add text comments to an RFI via POST /api/rfi-comments
- [ ] Display comment thread on RFI detail page
- [ ] Show comment author name and timestamp
- [ ] List comments via GET /api/rfis/:rfiId/comments
- [ ] Delete own comments via DELETE /api/rfi-comments/:id

---

### US-RI011: Attach Files to RFI
**As a** Builder/PM, **I want to** attach files (drawings, photos, documents) to an RFI, **so that** I can provide visual context for the information request.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Upload multiple file attachments to an RFI
- [ ] Store attachment URLs and file names as arrays (attachmentUrls, attachmentFileNames)
- [ ] Display attached files with download links on detail view
- [ ] Support common file types (PDF, images, documents)

---

### US-RI012: Attach Files to RFI Response
**As a** Builder/PM, **I want to** attach files to an RFI response, **so that** the responding party can include drawings, markups, or reference documents with their answer.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Upload file attachments specifically to the response section
- [ ] Store as responseAttachmentUrls and responseAttachmentFileNames arrays
- [ ] Display response attachments separately from question attachments
- [ ] Support common file types

---

### US-RI013: Set RFI Priority
**As a** Builder/PM, **I want to** set priority levels on RFIs, **so that** urgent information requests are clearly flagged and addressed first.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set priority from dropdown: low, normal, high, urgent
- [ ] Display priority badge with colour coding on list and detail views
- [ ] Filter RFI list by priority level
- [ ] Default priority to "normal"

---

### US-RI014: Track RFI Due Dates
**As a** Builder/PM, **I want to** set due dates on RFIs, **so that** I can ensure timely responses and avoid project delays.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Date picker for RFI due date
- [ ] Display due date on RFI list table
- [ ] Visual indicator for overdue RFIs
- [ ] Due date displayed on detail view

---

### US-RI015: Email RFI to Recipient
**As a** Builder/PM, **I want to** email an RFI directly to the directed-to contact, **so that** the recipient is notified and can respond.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Send email to directedToEmail address on submission
- [ ] Include RFI subject, question content, and reference number in email
- [ ] Record sentAt timestamp and sentToEmail on the RFI
- [ ] Show confirmation that email was sent

---

### US-RI016: Generate RFI PDF
**As a** Builder/PM, **I want to** generate a PDF of an RFI, **so that** I can print, archive, or share a formal document version.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Generate PDF with RFI number, subject, question, directed-to details, response, and attachments
- [ ] Store generated PDF URL on the RFI record (pdfUrl)
- [ ] Include company branding and formatting
- [ ] Download PDF from detail view

---

### US-RI017: Add Internal Notes to RFI
**As a** Builder/PM, **I want to** add internal notes to an RFI, **so that** I can record private observations not visible to external parties.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Text field for internal notes on RFI form
- [ ] Internal notes stored on the RFI record
- [ ] Internal notes are not included in emailed or PDF versions
- [ ] Visible only to internal team members

---

### US-RI018: Manage RFI Templates
**As a** Admin, **I want to** create and manage RFI templates, **so that** common information requests can be submitted quickly and consistently.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create templates with subject, question template, directed-to type, priority, and internal notes
- [ ] View list of all RFI templates via GET /api/rfi-templates
- [ ] Edit existing templates via PATCH /api/rfi-templates/:id
- [ ] Delete templates via DELETE /api/rfi-templates/:id
- [ ] Templates accessible from CreateRFI page

---

### US-RI019: View RFI Detail
**As a** Builder/PM, **I want to** view the full detail of an RFI, **so that** I can review the question, response, attachments, and discussion.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display RFI number, subject, status badge, and priority badge
- [ ] Show question content in rich text format
- [ ] Show directed-to contact information
- [ ] Display due date and creation date
- [ ] Show response content and response attachments if answered
- [ ] Show comment thread
- [ ] Show file attachments with download links
- [ ] Show internal notes

---

### US-RI020: Delete RFI
**As a** Builder/PM, **I want to** delete an RFI, **so that** I can remove erroneous or duplicate information requests.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete RFI via DELETE /api/rfis/:id
- [ ] Show confirmation dialog before deletion
- [ ] Remove associated comments
- [ ] Navigate back to RFI list after deletion
- [ ] Show success toast notification

---

### US-RI021: Filter RFIs by Status
**As a** Builder/PM, **I want to** filter RFIs by status, **so that** I can focus on RFIs requiring my attention.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status filter with options: draft, submitted, under_review, answered, closed
- [ ] Show count per status
- [ ] Apply filter to list view
- [ ] Show active filter indicator
- [ ] Support clearing filters

---

### US-RI022: Auto-Generate RFI Numbers
**As a** Builder/PM, **I want to** have RFI numbers automatically generated, **so that** each RFI has a unique, sequential reference number tied to its project.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Auto-generate in format "XXXX-RFI-XXX" where XXXX is the project number prefix
- [ ] Sequential numbering within each project (001, 002, 003...)
- [ ] RFI number assigned on creation and immutable thereafter
- [ ] Display RFI number prominently on list and detail views

---

## Technical Notes
- RFI numbers auto-generated on backend in format "XXXX-RFI-XXX" where XXXX is the project prefix
- Question field requires minimum 10 characters and supports rich text (HTML)
- Status enum: draft, submitted, under_review, answered, closed
- Priority enum: low, normal, high, urgent
- directedToType enum: client, architect, engineer, consultant, subcontractor, other
- File attachments stored as parallel arrays: attachmentUrls[] and attachmentFileNames[]
- Response attachments stored separately: responseAttachmentUrls[] and responseAttachmentFileNames[]
- RFI comments stored in separate rfiComments table linked by rfiId
- RFI templates stored in rfiTemplates table with subject, questionTemplate, directedToType, priority, internalNotes
- PDF generation stores URL in pdfUrl field on the RFI record
- Email sending records sentAt timestamp and sentToEmail on the RFI
- Frontend split across RFIs.tsx (591 lines, list view), RFIDetail.tsx (539 lines), CreateRFI.tsx, RfiTemplates.tsx, and RfiTemplateDetail.tsx

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/rfis | List all RFIs (with optional projectId, status, priority query params) |
| POST | /api/rfis | Create a new RFI |
| GET | /api/rfis/:id | Get a single RFI |
| PATCH | /api/rfis/:id | Update an RFI |
| DELETE | /api/rfis/:id | Delete an RFI |
| GET | /api/rfis/:rfiId/comments | Get comments for an RFI |
| POST | /api/rfi-comments | Create a comment on an RFI |
| DELETE | /api/rfi-comments/:id | Delete a comment |
| GET | /api/rfi-templates | List all RFI templates |
| POST | /api/rfi-templates | Create a new RFI template |
| PATCH | /api/rfi-templates/:id | Update an RFI template |
| DELETE | /api/rfi-templates/:id | Delete an RFI template |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /rfis | RFIs.tsx | RFI list view with search/filter |
| /rfis/new | CreateRFI.tsx | Create new RFI form |
| /rfis/:id | RFIDetail.tsx | RFI detail/edit view |
| /rfi-templates | RfiTemplates.tsx | RFI templates list |
| /rfi-templates/:id | RfiTemplateDetail.tsx | RFI template detail/edit |
| /projects/:projectId/rfis | RFIs.tsx | Project-scoped RFI list |
| /projects/:projectId/rfis/new | CreateRFI.tsx | Create RFI within project |
| /projects/:projectId/rfis/:rfiId | RFIDetail.tsx | Project-scoped RFI detail |

## Known Issues / Future Enhancements
- [ ] No RFI register export to Excel/CSV
- [ ] No automatic reminder emails for overdue RFIs
- [ ] No RFI revision tracking (amendment history)
- [ ] No integration with drawing/document management for cross-referencing
- [ ] No bulk status update for multiple RFIs
- [ ] No RFI dashboard with analytics (average response time, overdue count)
- [ ] No mobile-optimised RFI creation for on-site use
- [ ] No digital signature on RFI responses

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 22
- Implemented: 22
- Partially Implemented: 0
- Not Implemented: 0
